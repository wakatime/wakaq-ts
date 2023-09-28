import Redis from 'ioredis';
import { fork } from 'node:child_process';
import * as net from 'node:net';
import process from 'node:process';
import { Duration } from 'ts-duration';
import { type Logger } from 'winston';
import { Child } from './child';
import { setupLogging } from './logger';
import { deserialize } from './serializer';
import { WakaQ } from './wakaq';

export class WakaWorker {
  public wakaq: WakaQ;
  public appImportPath: string;
  public children: Child[] = [];
  private _stopProcessing: boolean = false;
  private _pubsub: Redis;
  public logger: Logger;

  constructor(wakaq: WakaQ, appImportPath: string) {
    this.wakaq = wakaq;
    this.appImportPath = appImportPath;
    this.logger = setupLogging(this.wakaq);
    this.wakaq.logger = this.logger;
    this._pubsub = this.wakaq.broker.duplicate();
  }

  async start() {
    this.logger.info(`concurrency=${this.wakaq.concurrency}`);
    this.logger.info(`soft_timeout=${this.wakaq.softTimeout}`);
    this.logger.info(`hard_timeout=${this.wakaq.hardTimeout}`);
    this.logger.info(`wait_timeout=${this.wakaq.waitTimeout}`);
    this.logger.info(`exclude_queues=${this.wakaq.excludeQueues}`);
    this.logger.info(`max_retries=${this.wakaq.maxRetries}`);
    this.logger.info(`max_mem_percent=${this.wakaq.maxMemPercent}`);
    this.logger.info(`max_tasks_per_worker=${this.wakaq.maxTasksPerWorker}`);
    this.logger.info(`worker_log_file=${this.wakaq.workerLogFile}`);
    this.logger.info(`scheduler_log_file=${this.wakaq.schedulerLogFile}`);
    this.logger.info(`worker_log_level=${this.wakaq.workerLogLevel}`);
    this.logger.info(`scheduler_log_level=${this.wakaq.schedulerLogLevel}`);
    this.logger.info(`starting ${this.wakaq.concurrency} workers...`);

    process.on('SIGINT', this._onExitParent);
    process.on('SIGTERM', this._onExitParent);
    process.on('SIGQUIT', this._onExitParent);

    // spawn child processes
    for (let i = 0; i < this.wakaq.concurrency; i++) {
      this._forkChild();
    }
    this.logger.info('finished spawning all workers');

    try {
      this._pubsub.subscribe(this.wakaq.broadcastKey, (err) => {
        if (err) this.logger.error(`Failed to subscribe to broadcast tasks: ${err.message}`);
      });
      this._pubsub.on('message', this._handleBroadcastTask);

      while (!this._stopProcessing) {
        this._respawnMissingChildren();
        this._enqueueReadyEtaTasks();
        this._checkChildRuntimes();
        await this.wakaq.sleep(Duration.millisecond(500));
      }

      if (this.children.length > 0) {
        this.logger.info('shutting down...');
        while (this.children.length > 0) {
          this._stopAllChildren();
          this._checkChildRuntimes();
          await this.wakaq.sleep(Duration.millisecond(500));
        }
      }
    } catch (error) {
      this.logger.error(error);
      this._stop();
    }
  }

  private _forkChild() {
    const t = this;
    this.logger.info(`fork("${__filename}", "child")`);
    const process = fork(__filename, ['child', '--app', this.appImportPath], { serialization: 'advanced' });
    const child = new Child(this.wakaq, process);
    process.on('exit', (code: number, signal: string) => {
      t._onChildExited(child, code, signal);
    });
    process.on('error', (code: number, signal: string) => {
      t._onChildExited(child, code, signal);
    });
    process.on('message', (message: any, socket: any) => {
      t._onMessageReceivedFromChild(child, message, socket);
    });
    this.children.push(child);
  }

  private _stop() {
    this._stopProcessing = true;
    this.children.forEach((child) => {
      child.sigterm();
    });
  }

  private _stopAllChildren() {
    this.children.forEach((child) => {
      child.sigterm();
    });
  }

  private _onExitParent() {
    this._stop();
  }

  private _onChildExited(child: Child, code: number, signal: string) {
    this.children = this.children.filter((c) => c !== child);
  }

  private _onMessageReceivedFromChild(child: Child, message: string, socket: net.Socket | net.Server) {
    this.logger.debug(`received ping from child process ${child.process.pid}`);
    child.lastPing = Math.round(Date.now() / 1000);
    if (!message) return;
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

  _enqueueReadyEtaTasks() {
    this.wakaq.queues.forEach(async (q) => {
      const results = await this.wakaq.broker.getetatasks(q.brokerEtaKey, String(Math.round(Date.now() / 1000)));
      results.forEach((result) => {
        const payload = deserialize(result);
        const taskName = payload.name;
        const args = payload.args;
        this.wakaq.enqueueAtFront(taskName, args, q);
      });
    });
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
      this._forkChild();
    }
  }
}
