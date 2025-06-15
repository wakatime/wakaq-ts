import { type Logger } from 'winston';
import { PreventTaskExecution, SoftTimeout } from './exceptions.js';
import { setupLogging } from './logger.js';
import { WakaQueue } from './queue.js';
import { deserialize } from './serializer.js';
import { Task } from './task.js';
import { WakaQ } from './wakaq.js';

export class WakaQChildWorker {
  public wakaq: WakaQ;
  private _stopProcessing: boolean = false;
  private _numTasksProcessed: number = 0;
  public logger: Logger;

  constructor(wakaq: WakaQ) {
    this.wakaq = wakaq;
    this.logger = setupLogging(this.wakaq, true);
    this.wakaq.logger = this.logger;
  }

  async start() {
    const _this = this;

    process.on('SIGINT', this._ignoreSignal);
    process.on('SIGTERM', () => _this._stop());
    process.on('SIGQUIT', () => _this._onSoftTimeout());

    process.on('message', this._onMessageFromParent);

    try {
      this.logger.debug(`started worker process ${process.pid}`);

      await this.wakaq.connect();

      if (this.wakaq.afterWorkerStartedCallback) await this.wakaq.afterWorkerStartedCallback();

      this._numTasksProcessed = 0;
      while (!this._stopProcessing) {
        this._sendPingToParent();
        const { queueBrokerKey, payload } = await this.wakaq.blockingDequeue();
        if (queueBrokerKey !== undefined && payload !== undefined) {
          const task = this.wakaq.tasks.get(payload.name);
          if (!task && payload.name) this.logger.error(`Task not found: ${payload.name}`);
          if (task) {
            const queue = this.wakaq.queuesByKey.get(queueBrokerKey);
            this.wakaq.currentTask = payload;
            const retry = payload.retry ?? 0;
            this.logger.debug(`working on task ${task.name}`);

            try {
              await this._executeTask(task, payload.args, queue);
            } catch (error) {
              if (error instanceof SoftTimeout) {
                const maxRetries = task.maxRetries ?? queue?.maxRetries ?? this.wakaq.maxRetries;
                if (retry + 1 > maxRetries) {
                  this.logger.error(error);
                } else {
                  this.logger.warning(error);
                  this.wakaq.enqueueAtEnd(task.name, payload.args, queue, retry);
                }
              } else if (error instanceof PreventTaskExecution) {
                this.logger.debug(error);
              } else {
                this.logger.error(error);
              }
            } finally {
              this.wakaq.currentTask = undefined;
            }
          } else {
            this._sendPingToParent();
          }
        } else {
          this._sendPingToParent();
        }
        if (this.wakaq.maxTasksPerWorker && this._numTasksProcessed >= this.wakaq.maxTasksPerWorker) {
          this.logger.info(`restarting worker after ${this._numTasksProcessed} tasks`);
          this._stopProcessing = true;
        }
      }
    } catch (error) {
      if (error instanceof SoftTimeout) {
        if (this.wakaq.currentTask !== null) throw error;
      } else {
        this.logger.error(error);
      }
    } finally {
      this.wakaq.disconnect();
      process.off('message', this._onMessageFromParent);
    }
  }

  private _ignoreSignal() {
    // noop
  }

  private _stop() {
    this._stopProcessing = true;
  }

  private _onSoftTimeout() {
    this._stopProcessing = true;
    throw new SoftTimeout('SoftTimeout');
  }

  private _sendPingToParent(taskName: string = '', queueName: string = '') {
    const msg = {
      type: 'wakaq-ping',
      taskName,
      queueName,
    };
    if (process.send) {
      process.send(msg, undefined, undefined, (e) => {
        if (e) this.logger.warn(e);
      });
    }
  }

  private async _executeTask(task: Task, variables?: unknown, queue?: WakaQueue) {
    this._sendPingToParent(task.name, queue?.name);
    this.logger.debug(`running with args ${variables}`);
    if (this.wakaq.beforeTaskStartedCallback) await this.wakaq.beforeTaskStartedCallback(task);
    try {
      await task.fn(variables);
    } finally {
      this._sendPingToParent();
      this._numTasksProcessed += 1;
      if (this.wakaq.afterTaskFinishedCallback) await this.wakaq.afterTaskFinishedCallback(task as Task);
    }
  }

  private async _onMessageFromParent(message: string) {
    console.log('_onMessageFromParent');
    console.log(message);
    const payload = deserialize(message);
    const task = this.wakaq.tasks.get(payload.name);
    if (!task) {
      this.logger.error(`Task not found: ${payload.name}`);
      return;
    }

    let retry = 0;
    this.wakaq.currentTask = payload;
    try {
      while (true) {
        try {
          await this._executeTask(task, payload.payload);
          break;
        } catch (error) {
          if (error instanceof SoftTimeout) {
            retry += 1;
            const maxRetries = task.maxRetries ?? this.wakaq.maxRetries;
            if (retry > maxRetries) {
              this.logger.error(error);
              break;
            } else {
              this.logger.warning(error);
            }
          } else if (error instanceof PreventTaskExecution) {
            this.logger.debug(error);
            break;
          } else {
            this.logger.error(error);
            break;
          }
        }
      }
    } finally {
      this.wakaq.currentTask = undefined;
    }
  }
}
