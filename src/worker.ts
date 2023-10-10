import { spawn } from 'node:child_process';
import process from 'node:process';
import * as os from 'os';
import pidusage from 'pidusage';
import { Duration } from 'ts-duration';
import { type Logger } from 'winston';
import { Child } from './child.js';
import { setupLogging } from './logger.js';
import { deserialize } from './serializer.js';
import { WakaQ } from './wakaq.js';

export class WakaQWorker {
  public wakaq: WakaQ;
  public childWorkerCommand: string;
  public childWorkerArgs: string[];
  public children: Child[] = [];
  private _stopProcessing: boolean = false;
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
    this.logger.info(`concurrency=${this.wakaq.concurrency}`);
    this.logger.info(`soft_timeout=${this.wakaq.softTimeout.seconds}`);
    this.logger.info(`hard_timeout=${this.wakaq.hardTimeout.seconds}`);
    this.logger.info(`wait_timeout=${this.wakaq.waitTimeout.seconds}`);
    this.logger.info(`exclude_queues=${this.wakaq.excludeQueues}`);
    this.logger.info(`max_retries=${this.wakaq.maxRetries}`);
    this.logger.info(`max_mem_percent=${this.wakaq.maxMemPercent}`);
    this.logger.info(`max_tasks_per_worker=${this.wakaq.maxTasksPerWorker}`);
    this.logger.info(`worker_log_file=${this.wakaq.workerLogFile}`);
    this.logger.info(`scheduler_log_file=${this.wakaq.schedulerLogFile}`);
    this.logger.info(`worker_log_level=${this.wakaq.workerLogLevel}`);
    this.logger.info(`scheduler_log_level=${this.wakaq.schedulerLogLevel}`);
    this.logger.info(`starting ${this.wakaq.concurrency} workers...`);

    const _this = this;

    process.on('SIGINT', () => _this._onExitParent());
    process.on('SIGTERM', () => _this._onExitParent());
    process.on('SIGQUIT', () => _this._onExitParent());

    // spawn child processes
    for (let i = 0; i < this.wakaq.concurrency; i++) {
      this._spawnChild();
    }
    this.logger.info('finished spawning all workers');

    try {
      this.wakaq.pubsub.subscribe(this.wakaq.broadcastKey, (err) => {
        if (err) this.logger.error(`Failed to subscribe to broadcast tasks: ${err.message}`);
      });
      this.wakaq.pubsub.on('message', this._handleBroadcastTask);

      while (!this._stopProcessing) {
        this._respawnMissingChildren();
        await this._enqueueReadyEtaTasks();
        this._checkChildRuntimes();
        await this.wakaq.sleep(Duration.millisecond(500));
      }

      if (this.children.length > 0) {
        this.logger.info('shutting down...');
        while (this.children.length > 0) {
          this._stopAllChildren();
          await this._checkChildMemoryUsages();
          this._checkChildRuntimes();
          await this.wakaq.sleep(Duration.millisecond(500));
        }
      }
    } catch (error) {
      this.logger.error(error);
      this._stop();
    }
  }

  private _spawnChild() {
    const t = this;
    this.logger.info(`spawning child worker: ${this.childWorkerCommand} ${this.childWorkerArgs.join(' ')}`);
    const process = spawn(this.childWorkerCommand, this.childWorkerArgs);
    const child = new Child(this.wakaq, process);
    process.on('close', (code: number) => {
      t._onChildExited(child, code);
    });
    process.stdout.on('data', (data: string | Buffer) => {
      t._onMessageReceivedFromChild(child, data);
    });
    this.children.push(child);
  }

  private _stop() {
    this._stopProcessing = true;
    this.children.forEach((child) => {
      child.sigterm();
    });
    this.wakaq.dispose();
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
    this.children = this.children.filter((c) => c !== child);
  }

  private _onMessageReceivedFromChild(child: Child, message: string | Buffer) {
    this.logger.debug(`received ping from child process ${child.process.pid}`);
    child.lastPing = Math.round(Date.now() / 1000);
    if (!message) return;
    if (message instanceof Buffer) message = message.toString();
    const parts = message.split(':', 1);
    if (parts.length == 2) {
      const taskName = parts[0];
      const task = taskName ? this.wakaq.tasks.get(taskName) : undefined;
      const queueName = parts[1];
      const queue = this.wakaq.queues.find((q) => {
        return q.name === queueName;
      });
      child.setTimeouts(this.wakaq, task, queue);
    } else {
      child.setTimeouts(this.wakaq);
    }
    child.softTimeoutReached = false;
  }

  async _enqueueReadyEtaTasks() {
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

  async _checkChildMemoryUsages() {
    if (!this.wakaq.maxMemPercent) return;
    const totalMem = os.totalmem();
    const percent = ((totalMem - os.freemem()) / totalMem) * 100;
    if (percent < this.wakaq.maxMemPercent) return;
    const usages = await Promise.all(this.children.map(async (child) => (await pidusage(child.process.pid ?? 0)).memory || 0));
    const maxIndex = usages.reduce((iMax, x, i, arr) => (x > (arr[iMax] ?? 0) ? i : iMax), 0);
    const child = this.children.at(maxIndex);
    child?.sigterm();
  }

  _checkChildRuntimes() {
    this.children.forEach((child) => {
      const softTimeout = child.softTimeout || this.wakaq.softTimeout;
      const hardTimeout = child.hardTimeout || this.wakaq.hardTimeout;
      if (softTimeout || hardTimeout) {
        const now = Math.round(Date.now() / 1000);
        const runtime = Duration.second(now - child.lastPing);
        if (hardTimeout && runtime > hardTimeout) {
          this.logger.debug(`child process ${child.process.pid} runtime ${runtime} reached hard timeout, sending sigkill`);
          child.sigkill();
        } else if (!child.softTimeoutReached && softTimeout && runtime > softTimeout) {
          this.logger.debug(`child process ${child.process.pid} runtime ${runtime} reached soft timeout, sending sigquit`);
          child.softTimeoutReached = true;
          child.sigquit();
        }
      }
    });
  }

  _handleBroadcastTask(channel: string, message: string) {
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

  _respawnMissingChildren() {
    if (this._stopProcessing) return;
    for (let i = this.wakaq.concurrency - this.children.length; i > 0; i--) {
      this.logger.debug('restarting a crashed worker');
      this._spawnChild();
    }
  }
}
