import { Callback, Redis, Result } from 'ioredis';
import * as os from 'os';
import { type ConnectionOptions } from 'tls';
import { Duration } from 'ts-duration';
import { type Logger } from 'winston';
import { ZRANGEPOP } from './constants.js';
import { CronTask } from './cronTask.js';
import { WakaQError } from './exceptions.js';
import { Level } from './logger.js';
import { WakaQueue } from './queue.js';
import { deserialize, serialize } from './serializer.js';
import { Task } from './task.js';

declare module 'ioredis' {
  interface RedisCommander<Context> {
    getetatasks(key: string, argv: string, callback?: Callback<string[]>): Result<string[], Context>;
  }
}

export interface RegisterTaskParams {
  name?: string;
  queue?: WakaQueue | string;
  maxRetries?: number;
  softTimeout?: Duration;
  hardTimeout?: Duration;
}

export interface WakaQParams {
  queues?: WakaQueue[];
  schedules?: CronTask[];
  host?: string;
  port?: number;
  db?: number;
  tls?: ConnectionOptions;
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
  singleProcess?: boolean;
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
  public singleProcess: boolean;
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
    const tls = params?.tls;
    const concurrency = params?.concurrency ?? 1;
    const excludeQueues = params?.excludeQueues ?? [];
    const maxRetries = params?.maxRetries ?? 0;
    const maxMemPercent = params?.maxMemPercent ?? 0;
    const maxTasksPerWorker = params?.maxTasksPerWorker ?? 0;
    this.connectTimeout = params?.connectTimeout ?? 15000;
    this.commandTimeout = params?.commandTimeout ?? 15000;
    this.keepAlive = params?.keepAlive ?? 0;
    this.noDelay = params?.noDelay ?? true;
    this.singleProcess = params?.singleProcess ?? false;
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

    this.softTimeout = this._asDuration(params?.softTimeout, 0);
    this.hardTimeout = this._asDuration(params?.hardTimeout, 0);
    this.waitTimeout = this._asDuration(params?.waitTimeout, 1);

    if (this.waitTimeout.seconds < 1) throw new WakaQError(`Wait timeout (${this.waitTimeout.seconds}) can not be less than 1 second.`);

    if (!this.singleProcess) {
      if (this.softTimeout.seconds && this.softTimeout.seconds <= this.waitTimeout.seconds)
        throw new WakaQError(
          `Soft timeout (${this.softTimeout.seconds}) can not be less than or equal to wait timeout (${this.waitTimeout.seconds}).`,
        );
      if (this.hardTimeout.seconds && this.hardTimeout.seconds <= this.waitTimeout.seconds)
        throw new WakaQError(
          `Hard timeout (${this.hardTimeout.seconds}) can not be less than or equal to wait timeout (${this.waitTimeout.seconds}).`,
        );
      if (this.softTimeout.seconds && this.hardTimeout.seconds && this.hardTimeout.seconds <= this.softTimeout.seconds)
        throw new WakaQError(
          `Hard timeout (${this.hardTimeout.seconds}) can not be less than or equal to soft timeout (${this.softTimeout.seconds}).`,
        );
    }

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
      tls: tls,
      lazyConnect: true,
      connectTimeout: this.connectTimeout,
      commandTimeout: this.commandTimeout,
      keepAlive: this.keepAlive,
      noDelay: this.noDelay,
    });
    this.broker.on('error', (err) => {
      this.logger?.error(err);
    });
  }

  public async connect() {
    await this.broker.connect();
    this.broker.defineCommand('getetatasks', {
      numberOfKeys: 1,
      lua: ZRANGEPOP,
    });
    return this;
  }

  public disconnect() {
    this.broker.disconnect();
    this._pubsub?.disconnect();
  }

  /*
  Task wrapper.

  Wrap an async function with this to register it as a task.
  Returns the new Task with methods enqueue(), enqueueAfterDelay,
  and broadcast().
  */
  public task(fn: (...arg0: unknown[]) => Promise<void>, params?: RegisterTaskParams): Task {
    const task = new Task(this, fn, params?.name, params?.queue, params?.softTimeout, params?.hardTimeout, params?.maxRetries);
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

  private _validateQueueNames(queueNames: string[]): string[] {
    queueNames.forEach((queueName) => {
      if (!this.queuesByName.has(queueName)) throw new WakaQError(`Invalid queue: ${queueName}`);
    });
    return queueNames;
  }

  private _asDuration(obj?: Duration | { seconds: number } | number, def?: number): Duration {
    if (obj instanceof Duration) return obj;
    if (typeof obj === 'object' && typeof obj.seconds === 'number') return obj as Duration;
    if (typeof obj === 'number') return Duration.second(obj);
    return Duration.second(def ?? 0);
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
    const pubsub = await this.pubsub();
    return await pubsub.publish(this.broadcastKey, payload);
  }

  public async sleep(duration: Duration) {
    return new Promise((resolve) => {
      setTimeout(resolve, duration.milliseconds);
    });
  }

  public async pubsub() {
    if (!this._pubsub) {
      this._pubsub = this.broker.duplicate();
      await this._pubsub.connect();
    }
    return this._pubsub;
  }

  get defaultQueue(): WakaQueue {
    if (this.queues.length === 0) throw new WakaQError('Missing queues.');
    return this.queues[this.queues.length - 1] as WakaQueue;
  }

  public async blockingDequeue(): Promise<{ queueBrokerKey?: string; payload?: { name: string; args: any[]; retry?: number } }> {
    if (this.brokerKeys.length === 0) {
      this.sleep(this.waitTimeout);
      return {};
    }
    const data = await this.broker.blpop(this.brokerKeys, this.waitTimeout.seconds);
    if (!data) return {};
    return { queueBrokerKey: data[0], payload: deserialize(data[1]) };
  }

  private _queueOrDefault(queue?: WakaQueue | string): WakaQueue {
    if (typeof queue === 'string') queue = this.queuesByName.get(queue);
    if (queue) return queue;

    return this.defaultQueue;
  }

  private _formatConcurrency(concurrency: number | string | undefined, isRecursive: boolean = false): number {
    if (!concurrency) return 0;

    if (typeof concurrency === 'number') {
      if (!isRecursive && concurrency < 1) throw new WakaQError(`Concurrency must be greater than zero: ${concurrency}`);
      return Math.round(concurrency);
    }

    const parsed = this._parseConcurrency(concurrency);
    if (Number.isNaN(parsed)) throw new WakaQError(`Error parsing concurrency: ${concurrency}`);
    if (!isRecursive && !parsed) return 1;
    if (!isRecursive && parsed < 1) throw new WakaQError(`Concurrency must be greater than zero: ${parsed}`);
    return parsed;
  }

  private _parseConcurrency(concurrency: string): number {
    const parts = concurrency.split('*');
    if (parts.length > 1) {
      return parts.map((part) => this._formatConcurrency(part, true)).reduce((a, n) => a * n, 1);
    } else {
      const cores = String(os.cpus().length);
      return Number.parseInt(concurrency.replace('cores', cores).trim());
    }
  }
}
