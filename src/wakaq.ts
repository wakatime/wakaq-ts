import { Callback, Redis, Result } from 'ioredis';
import * as os from 'os';
import { Duration } from 'ts-duration';
import { type Logger } from 'winston';
import { ZRANGEPOP } from './constants.js';
import { CronTask } from './cronTask.js';
import { WakaQError } from './exceptions.js';
import { Level } from './logger.js';
import { WakaQueue } from './queue.js';
import { serialize } from './serializer.js';
import { Task } from './task.js';

declare module 'ioredis' {
  interface RedisCommander<Context> {
    getetatasks(key: string, argv: string, callback?: Callback<string[]>): Result<string[], Context>;
  }
}

export interface WakaQParams {
  queues?: WakaQueue[];
  schedules?: CronTask[];
  host?: string;
  port?: number;
  db?: number;
  concurrency?: number;
  excludeQueues?: string[];
  maxRetries?: number;
  softTimeout?: Duration | number;
  hardTimeout?: Duration | number;
  maxMemPercent?: number;
  maxTasksPerWorker?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  keepAlive?: number;
  noDelay?: boolean;
  waitTimeout?: Duration | number;
  username?: string;
  password?: string;
  workerLogFile?: string;
  schedulerLogFile?: string;
  workerLogLevel?: Level;
  schedulerLogLevel?: Level;
  afterWorkerStartedCallback?: () => Promise<void>;
  beforeTaskStartedCallback?: (task: Task) => Promise<void>;
  afterTaskFinishedCallback?: (task: Task) => Promise<void>;
}

export class WakaQ {
  public tasks: Map<string, Task> = new Map<string, Task>([]);
  public broker: Redis;
  public queues: WakaQueue[];
  public queuesByName: Map<string, WakaQueue> = new Map<string, WakaQueue>([]);
  public queuesByKey: Map<string, WakaQueue> = new Map<string, WakaQueue>([]);
  public softTimeout: Duration;
  public hardTimeout: Duration;
  public concurrency: number;
  public schedules: CronTask[];
  public excludeQueues: string[];
  public maxRetries: number;
  public connectTimeout: number;
  public commandTimeout: number;
  public keepAlive: number;
  public noDelay: boolean;
  public waitTimeout: Duration;
  public maxMemPercent: number;
  public maxTasksPerWorker: number;
  public workerLogFile?: string;
  public schedulerLogFile?: string;
  public workerLogLevel: Level;
  public schedulerLogLevel: Level;
  public logger?: Logger;
  private _pubsub?: Redis;

  public currentTask?: Task;
  public brokerKeys: string[];

  public afterWorkerStartedCallback?: () => Promise<void>;
  public beforeTaskStartedCallback?: (task: Task) => Promise<void>;
  public afterTaskFinishedCallback?: (task: Task) => Promise<void>;

  public broadcastKey = 'wakaq-broadcast';

  constructor(params?: WakaQParams) {
    const queues = params?.queues ?? [];
    const schedules = params?.schedules ?? [];
    const host = params?.host ?? 'localhost';
    const port = params?.port ?? 6379;
    const db = params?.db ?? 0;
    const concurrency = params?.concurrency ?? 0;
    const excludeQueues = params?.excludeQueues ?? [];
    const maxRetries = params?.maxRetries ?? 0;
    const maxMemPercent = params?.maxMemPercent ?? 0;
    const maxTasksPerWorker = params?.maxTasksPerWorker ?? 0;
    this.connectTimeout = params?.connectTimeout ?? 15000;
    this.commandTimeout = params?.commandTimeout ?? 15000;
    this.keepAlive = params?.keepAlive ?? 0;
    this.noDelay = params?.noDelay ?? true;
    const {
      username,
      password,
      workerLogLevel,
      schedulerLogLevel,
      afterWorkerStartedCallback,
      beforeTaskStartedCallback,
      afterTaskFinishedCallback,
    } = params ?? {};

    const lowestPriority = Math.max(
      ...queues.map((q) => {
        return q.priority;
      }),
    );
    queues.forEach((q) => q.setDefaultPriority(lowestPriority));
    queues.sort((a, b) => a.priority - b.priority);
    this.queues = queues;

    queues.forEach((q) => {
      this.queuesByName.set(q.name, q);
      this.queuesByKey.set(q.brokerKey, q);
    });

    this.excludeQueues = this._validateQueueNames(excludeQueues);
    this.maxRetries = maxRetries;

    this.brokerKeys = queues.filter((q) => !this.excludeQueues.includes(q.name)).map((q) => q.brokerKey);
    this.schedules = schedules;

    this.concurrency = this._formatConcurrency(concurrency);

    this.softTimeout = params?.softTimeout instanceof Duration ? params.softTimeout : Duration.second(params?.softTimeout ?? 0);
    this.hardTimeout = params?.hardTimeout instanceof Duration ? params.hardTimeout : Duration.second(params?.hardTimeout ?? 0);
    this.waitTimeout = params?.waitTimeout instanceof Duration ? params.waitTimeout : Duration.second(params?.waitTimeout ?? 1);

    if (this.softTimeout && this.softTimeout <= this.waitTimeout)
      throw new WakaQError(`Soft timeout (${this.softTimeout}) can not be less than or equal to wait timeout (${this.waitTimeout}).`);
    if (this.hardTimeout && this.hardTimeout <= this.waitTimeout)
      throw new WakaQError(`Hard timeout (${this.hardTimeout}) can not be less than or equal to wait timeout (${this.waitTimeout}).`);
    if (this.softTimeout && this.hardTimeout && this.hardTimeout <= this.softTimeout)
      throw new WakaQError(`Hard timeout (${this.hardTimeout}) can not be less than or equal to soft timeout (${this.softTimeout}).`);

    if ((maxMemPercent && maxMemPercent < 1) || maxMemPercent > 99)
      throw new WakaQError(`Max memory percent must be between 1 and 99: ${maxMemPercent}`);
    this.maxMemPercent = maxMemPercent;

    this.maxTasksPerWorker = maxTasksPerWorker > 0 ? maxTasksPerWorker : 0;
    this.workerLogFile = params?.workerLogFile;
    this.schedulerLogFile = params?.schedulerLogFile;
    this.workerLogLevel = workerLogLevel ?? Level.INFO;
    this.schedulerLogLevel = schedulerLogLevel ?? Level.INFO;

    this.afterWorkerStartedCallback = afterWorkerStartedCallback;
    this.beforeTaskStartedCallback = beforeTaskStartedCallback;
    this.afterTaskFinishedCallback = afterTaskFinishedCallback;

    this.broker = new Redis({
      host: host,
      port: port,
      username: username,
      password: password,
      db: db,
      connectTimeout: this.connectTimeout,
      commandTimeout: this.commandTimeout,
      keepAlive: this.keepAlive,
      noDelay: this.noDelay,
    });
    this.broker.defineCommand('getetatasks', {
      numberOfKeys: 1,
      lua: ZRANGEPOP,
    });
    this.broker.on('error', (err) => {
      this.logger?.error(err);
    });
  }

  public dispose() {
    this.broker.disconnect();
    this._pubsub?.disconnect();
  }

  /*
  Task wrapper.

  Wrap an async function with this to register it as a task.
  Returns the new Task with methods delay() and broadcast().
  */
  public task(
    fn: (...arg0: unknown[]) => Promise<void>,
    queue?: WakaQueue | string,
    maxRetries?: number,
    softTimeout?: Duration,
    hardTimeout?: Duration,
  ): Task {
    const task = new Task(this, fn, queue, softTimeout, hardTimeout, maxRetries);
    if (this.tasks.has(task.name)) throw new WakaQError(`Duplicate task name: ${task.name}`);
    this.tasks.set(task.name, task);
    return task;
  }

  public afterWorkerStarted(callback: () => Promise<void>) {
    this.afterWorkerStartedCallback = callback;
    return callback;
  }

  public beforeTaskStarted(callback: (task: Task) => Promise<void>) {
    this.beforeTaskStartedCallback = callback;
    return callback;
  }

  public afterTaskFinished(callback: (task: Task) => Promise<void>) {
    this.afterTaskFinishedCallback = callback;
    return callback;
  }

  _validateQueueNames(queueNames: string[]): string[] {
    queueNames.forEach((queueName) => {
      if (!this.queuesByName.has(queueName)) throw new WakaQError(`Invalid queue: ${queueName}`);
    });
    return queueNames;
  }

  public async enqueueAtFront(taskName: string, args: any[], queue?: WakaQueue | string) {
    queue = this._queueOrDefault(queue);
    const payload = serialize({ name: taskName, args: args });
    await this.broker.lpush(queue.brokerKey, payload);
  }

  public async enqueueWithEta(taskName: string, args: any[], eta: Date | Duration, queue?: WakaQueue | string) {
    queue = this._queueOrDefault(queue);
    const payload = serialize({ name: taskName, args: args });
    const timestamp = Math.round((eta instanceof Duration ? Date.now() + eta.milliseconds : eta.getTime()) / 1000);
    await this.broker.zadd(queue.brokerEtaKey, 'NX', String(timestamp), payload);
  }

  public async enqueueAtEnd(taskName: string, args: any[], queue?: WakaQueue | string, retry = 0) {
    queue = this._queueOrDefault(queue);
    const payload = serialize({ name: taskName, args: args, retry: retry });
    await this.broker.rpush(queue.brokerKey, payload);
  }

  public async broadcast(taskName: string, args: any[]): Promise<number> {
    const payload = serialize({ name: taskName, args: args });
    return await this.pubsub.publish(this.broadcastKey, payload);
  }

  public async sleep(duration: Duration) {
    return new Promise((resolve) => {
      setTimeout(resolve, duration.milliseconds);
    });
  }

  private _queueOrDefault(queue?: WakaQueue | string): WakaQueue {
    if (typeof queue === 'string') queue = this.queuesByName.get(queue);
    if (queue) return queue;

    return this.defaultQueue;
  }

  get defaultQueue(): WakaQueue {
    if (this.queues.length === 0) throw new WakaQError('Missing queues.');
    return this.queues[-1] as WakaQueue;
  }

  get pubsub(): Redis {
    if (!this._pubsub) this._pubsub = this.broker.duplicate();
    return this._pubsub;
  }

  _formatConcurrency(concurrency: number | string | undefined): number {
    if (!concurrency) return 0;

    if (typeof concurrency === 'number') {
      if (concurrency < 1) throw new WakaQError(`Concurrency must be greater than zero: ${concurrency}`);
      return Math.round(concurrency);
    }

    const parts = concurrency.split('*');
    if (parts.length > 1) {
      return parts.map((part) => this._formatConcurrency(part)).reduce((a, n) => a * n, 1);
    } else {
      const cores = String(os.cpus().length);
      const x = Number.parseInt(concurrency.replace('cores', cores).trim());
      if (Number.isNaN(x)) throw new WakaQError(`Error parsing concurrency: ${concurrency}`);
      return x;
    }
  }
}
