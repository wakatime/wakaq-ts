import { spawn } from 'node:child_process';
import process from 'node:process';
import * as os from 'os';
import pidusage from 'pidusage';
import { Duration } from 'ts-duration';
import { type Logger } from 'winston';
import { Child } from './child.js';
import { setupLogging } from './logger.js';
import { WakaQPing } from './message.js';
import { WakaQueue } from './queue.js';
import { deserialize } from './serializer.js';
import { Task } from './task.js';
import { WakaQ } from './wakaq.js';

export class WakaQWorker {
  public wakaq: WakaQ;
  public childWorkerCommand: string;
  public childWorkerArgs: string[];
  public children: Child[] = [];
  private _stopProcessing: boolean = false;
  private _numTasksProcessed: number = 0;
  public logger: Logger;

  constructor(wakaq: WakaQ, childWorkerCommand: string[]) {
    this.wakaq = wakaq;
    if (childWorkerCommand.length == 0) throw Error('Missing child worker command.');
    this.childWorkerCommand = childWorkerCommand.shift() ?? '';
    this.childWorkerArgs = childWorkerCommand;
    this.logger = setupLogging(this.wakaq);
    this.wakaq.logger = this.logger;
  }

  async start() {
    if (!this.wakaq.singleProcess) {
      this.logger.info(`concurrency=${this.wakaq.concurrency}`);
      this.logger.info(`soft_timeout=${this.wakaq.softTimeout.seconds}`);
      this.logger.info(`hard_timeout=${this.wakaq.hardTimeout.seconds}`);
    }
    this.logger.info(`wait_timeout=${this.wakaq.waitTimeout.seconds}`);
    this.logger.info(`exclude_queues=${this.wakaq.excludeQueues}`);
    this.logger.info(`max_retries=${this.wakaq.maxRetries}`);
    this.logger.info(`max_mem_percent=${this.wakaq.maxMemPercent}`);
    this.logger.info(`max_tasks_per_worker=${this.wakaq.maxTasksPerWorker}`);
    this.logger.info(`worker_log_file=${this.wakaq.workerLogFile}`);
    this.logger.info(`scheduler_log_file=${this.wakaq.schedulerLogFile}`);
    this.logger.info(`worker_log_level=${this.wakaq.workerLogLevel}`);
    this.logger.info(`scheduler_log_level=${this.wakaq.schedulerLogLevel}`);
    if (this.wakaq.singleProcess) {
      this.logger.info('running in single process mode...');
    } else {
      this.logger.info(`starting ${this.wakaq.concurrency} workers...`);
    }

    const _this = this;

    process.on('SIGINT', () => _this._onExitParent());
    process.on('SIGTERM', () => _this._onExitParent());
    process.on('SIGQUIT', () => _this._onExitParent());

    // spawn child processes
    if (!this.wakaq.singleProcess) {
      for (let i = 0; i < this.wakaq.concurrency; i++) {
        this._spawnChild();
      }
      this.logger.info('finished spawning all workers');
    }

    if (this.wakaq.singleProcess && this.wakaq.afterWorkerStartedCallback) await this.wakaq.afterWorkerStartedCallback();

    try {
      await this.wakaq.connect();
      const pubsub = await this.wakaq.pubsub();
      pubsub.on('message', this._handleBroadcastTask);
      await pubsub.subscribe(this.wakaq.broadcastKey, (err) => {
        if (err) this.logger.error(`Failed to subscribe to broadcast tasks: ${err.message}`);
      });

      this._numTasksProcessed = 0;
      while (!this._stopProcessing) {
        this._respawnMissingChildren();
        await this._enqueueReadyEtaTasks();
        if (this.wakaq.singleProcess) await this._processTasksSingleProcessMode();
        await this._checkChildMemoryUsages();
        this._checkChildRuntimes();
        await this.wakaq.sleep(Duration.millisecond(500));
      }

      this.logger.info('shutting down...');
      if (this.children.length > 0) {
        while (this.children.length > 0) {
          this._stop();
          await this._checkChildMemoryUsages();
          this._checkChildRuntimes();
          await this.wakaq.sleep(Duration.millisecond(500));
        }
      }
    } catch (error) {
      this.logger.error(error);
      this._stop();
    } finally {
      this.wakaq.disconnect();
    }
  }

  private _spawnChild() {
    const t = this;
    this.logger.info(`spawning child worker: ${this.childWorkerCommand} ${this.childWorkerArgs.join(' ')}`);
    const p = spawn(this.childWorkerCommand, this.childWorkerArgs, {
      stdio: [null, null, null, 'ipc'],
      // stdio: 'pipe',
    });
    const child = new Child(this.wakaq, p);
    p.on('close', (code: number) => {
      t._onChildExited(child, code);
    });
    p.on('message', (message: string | Buffer) => {
      t._onMessageReceivedFromChild(child, message);
    });
    p.stdout?.on('data', (data: string | Buffer) => {
      t._onOutputReceivedFromChild(child, data);
    });
    p.stderr?.on('data', (data: string | Buffer) => {
      t._onOutputReceivedFromChild(child, data);
    });
    this.children.push(child);
  }

  private async _processTasksSingleProcessMode() {
    const { queueBrokerKey, payload } = await this.wakaq.blockingDequeue();
    if (queueBrokerKey !== undefined && payload !== undefined) {
      const task = this.wakaq.tasks.get(payload.name);
      if (!task && payload.name) this.logger.error(`Task not found: ${payload.name}`);
      if (task) {
        const queue = this.wakaq.queuesByKey.get(queueBrokerKey);
        this.wakaq.currentTask = task;
        const retry = payload.retry ?? 0;
        this.logger.debug(`working on task ${task.name}`);

        try {
          await this._executeTask(task, payload.args, queue);
        } catch (error) {
          const maxRetries = task.maxRetries ?? queue?.maxRetries ?? this.wakaq.maxRetries;
          if (retry + 1 > maxRetries) {
            this.logger.error(error);
          } else {
            this.logger.warning(error);
            this.wakaq.enqueueAtEnd(task.name, payload.args, queue, retry);
          }
        } finally {
          this.wakaq.currentTask = undefined;
        }
      }
    }
    if (this.wakaq.maxTasksPerWorker && this._numTasksProcessed >= this.wakaq.maxTasksPerWorker) {
      this.logger.info(`exiting single process worker after ${this._numTasksProcessed} tasks`);
      this._stopProcessing = true;
    }
  }

  private _stop() {
    this._stopProcessing = true;
    this._stopAllChildren();
  }

  private _stopAllChildren() {
    this.children.forEach((child) => {
      child.sigterm();
    });
  }

  private _onExitParent() {
    this._stop();
  }

  private _onChildExited(child: Child, code: number) {
    this.logger.debug(`child process ${child.process.pid} exited: ${code}`);
    this.children = this.children.filter((c) => c !== child);
  }

  private _onOutputReceivedFromChild(child: Child, data: string | Buffer) {
    if (data instanceof Buffer) data = data.toString();
    if (!data) return;
    child.outputBuffer = `${child.outputBuffer}${data}`;
    let i = -1;
    while ((i = child.outputBuffer.indexOf('\n')) && i > -1) {
      const payload = child.outputBuffer.slice(0, i);
      child.outputBuffer = child.outputBuffer.slice(i + 1);
      if (payload.length > 0) {
        try {
          const parsed = JSON.parse(payload) as {
            level: string;
            message: string;
            payload?: { name?: string; args?: any[]; retry?: number };
          };
          if (parsed?.level) {
            this.logger.log(parsed.level, parsed.message, { worker: child.process.pid, payload: parsed.payload });
          } else {
            this.logger.info(payload);
          }
        } catch (e) {
          this.logger.info(payload);
        }
      }
    }
  }

  private _onMessageReceivedFromChild(child: Child, message: unknown) {
    if (typeof message !== 'object') return;
    const payload = message as WakaQPing;
    if (payload.type !== 'wakaq-ping') return;
    child.lastPing = Math.round(Date.now() / 1000);
    this.logger.debug(`received ping from child process ${child.process.pid}`);
    const taskName = payload.task;
    const task = taskName ? this.wakaq.tasks.get(taskName) : undefined;
    const queueName = payload.queue;
    const queue = this.wakaq.queues.find((q) => {
      return q.name === queueName;
    });
    child.setTimeouts(this.wakaq, task, queue);
    child.softTimeoutReached = false;
  }

  private async _enqueueReadyEtaTasks() {
    await Promise.all(
      this.wakaq.queues.map(async (q) => {
        const results = await this.wakaq.broker.getetatasks(q.brokerEtaKey, String(Math.round(Date.now() / 1000)));
        await Promise.all(
          results.map(async (result) => {
            const payload = deserialize(result);
            const taskName = payload.name;
            const args = payload.args;
            await this.wakaq.enqueueAtFront(taskName, args, q);
          }),
        );
      }),
    );
  }

  private async _checkChildMemoryUsages() {
    if (!this.wakaq.maxMemPercent) return;
    const totalMem = os.totalmem();
    const percent = ((totalMem - os.freemem()) / totalMem) * 100;
    if (percent < this.wakaq.maxMemPercent) return;
    if (this.wakaq.singleProcess) {
      this.logger.info('stopping single process worker from too much ram usage');
      this._stop();
      return;
    }
    const usages = await Promise.all(this.children.map(async (child) => (await pidusage(child.process.pid ?? 0)).memory || 0));
    const maxIndex = usages.reduce((iMax, x, i, arr) => (x > (arr[iMax] ?? 0) ? i : iMax), 0);
    const child = this.children.at(maxIndex);
    if (!child) return;
    this.logger.info(`killing child ${child.process.pid} from too much ram usage`);
    child.sigterm();
  }

  private _checkChildRuntimes() {
    this.children.forEach((child) => {
      const softTimeout = child.softTimeout || this.wakaq.softTimeout;
      const hardTimeout = child.hardTimeout || this.wakaq.hardTimeout;
      if (softTimeout || hardTimeout) {
        const now = Math.round(Date.now() / 1000);
        const runtime = Duration.second(now - child.lastPing);
        if (hardTimeout && runtime.seconds > hardTimeout.seconds) {
          //this.logger.debug(`child process ${child.process.pid} runtime ${runtime} reached hard timeout, sending sigkill`);
          this.logger.info(`child process ${child.process.pid} runtime ${runtime} reached hard timeout, sending sigkill`);
          child.sigkill();
        } else if (!child.softTimeoutReached && softTimeout && runtime.seconds > softTimeout.seconds) {
          //this.logger.debug(`child process ${child.process.pid} runtime ${runtime} reached soft timeout, sending sigquit`);
          this.logger.info(`child process ${child.process.pid} runtime ${runtime} reached soft timeout, sending sigquit`);
          child.softTimeoutReached = true;
          child.sigquit();
        }
      }
    });
  }

  private _handleBroadcastTask(channel: string, message: string) {
    const child = this.children.at(0);
    if (!child) {
      this.logger.error(`Unable to run broadcast task because no available child workers: ${message}`);
      return;
    }
    this.logger.debug(`run broadcast task: ${message}`);
    child.process.stdin?.write(`${message}\n`, (err) => {
      if (err) this.logger.error(`Unable to run broadcast task because writing to child stdin encountered an error: ${err}`);
    });
  }

  private _respawnMissingChildren() {
    if (this._stopProcessing) return;
    if (this.wakaq.singleProcess) return;
    for (let i = this.wakaq.concurrency - this.children.length; i > 0; i--) {
      this.logger.debug('restarting a crashed worker');
      this._spawnChild();
    }
  }

  private async _executeTask(task: Task, args: any[], queue?: WakaQueue) {
    this.logger.debug(`running with args ${args}`);
    if (this.wakaq.beforeTaskStartedCallback) this.wakaq.beforeTaskStartedCallback(task);
    try {
      await task.fn(...args);
    } finally {
      this._numTasksProcessed += 1;
      if (this.wakaq.afterTaskFinishedCallback) this.wakaq.afterTaskFinishedCallback(task);
    }
  }
}
