import { type Logger } from 'winston';
import { SoftTimeout } from './exceptions';
import { setupLogging } from './logger';
import { WakaQueue } from './queue';
import { deserialize } from './serializer';
import { Task } from './task';
import { WakaQ } from './wakaq';

export class ChildWorker {
  public wakaq: WakaQ;
  private _stopProcessing: boolean = false;
  private _numTasksProcessed: number = 0;
  public logger: Logger;

  constructor(wakaq: WakaQ) {
    this.wakaq = wakaq;
    this.logger = setupLogging(this.wakaq);
    this.wakaq.logger = this.logger;
  }

  async start() {
    const t = this;

    process.on('SIGINT', this._ignoreSignal);
    process.on('SIGTERM', this._stop);
    process.on('SIGQUIT', this._onSoftTimeout);

    setupLogging(this.wakaq, true);

    process.on('message', this._executeBroadcastTask);

    try {
      this.logger.debug(`started worker process ${process.pid}`);

      if (this.wakaq.afterWorkerStartedCallback) this.wakaq.afterWorkerStartedCallback();

      this._numTasksProcessed = 0;
      while (!this._stopProcessing) {
        this._sendPingToParent();
        const { queueBrokerKey, payload } = (await this._blockingDequeue()) || {};
        if (queueBrokerKey !== undefined && payload !== undefined) {
          const task = this.wakaq.tasks.get(payload.name);
          if (!task && payload.name) this.logger.error(`Task not found: ${payload.name}`);
          if (task) {
            const queue = this.wakaq.queuesByKey.get(queueBrokerKey);
            this.wakaq.currentTask = task;
            const retry = payload.retry ?? 0;

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

  private async _blockingDequeue(): Promise<
    { queueBrokerKey: string; payload: { name: string; args: any[]; retry?: number } } | undefined
  > {
    if (this.wakaq.brokerKeys.length === 0) {
      this.wakaq.sleep(this.wakaq.waitTimeout);
      return undefined;
    }
    const data = await this.wakaq.broker.blpop(this.wakaq.brokerKeys, this.wakaq.waitTimeout.seconds);
    if (!data) return undefined;
    return { queueBrokerKey: data[0], payload: deserialize(data[1]) };
  }

  private _sendPingToParent(taskName: string = '', queueName: string = '') {
    const msg = taskName === '' ? '' : `${taskName}:${queueName}`;
    if (process.send) process.send(msg);
  }

  async _executeTask(task: Task, args: any[], queue?: WakaQueue) {
    this._sendPingToParent(task.name, queue?.name);
    this.logger.debug(`running with args ${args}`);
    if (this.wakaq.beforeTaskStartedCallback) this.wakaq.beforeTaskStartedCallback();
    try {
      /*if (this.wakaq.wrapTasksFunction) {
        this.wakaq.wrapTasksFunction(task.fn)(...args);
      } else {
        task.fn(...args);
      }
      */
      task.fn(...args);
    } finally {
      this._sendPingToParent();
      this._numTasksProcessed += 1;
      if (this.wakaq.afterTaskFinishedCallback) this.wakaq.afterTaskFinishedCallback();
    }
  }

  async _executeBroadcastTask(message: string) {
    const payload = deserialize(message);
    const task = this.wakaq.tasks.get(payload.name);
    if (!task) {
      this.logger.error(`Task not found: ${payload.name}`);
      return;
    }

    let retry = 0;
    this.wakaq.currentTask = task;
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
