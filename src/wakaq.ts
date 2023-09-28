import Redis, { Callback, Result } from 'ioredis';
import * as os from 'os';
import { Duration } from 'ts-duration';
import { type Logger } from 'winston';
import { ZRANGEPOP } from './constants';
import { CronTask } from './cronTask';
import { WakaQError } from './exceptions';
import { Level } from './logger';
import { WakaQueue } from './queue';
import { serialize } from './serializer';
import { Task } from './task';

declare module 'ioredis' {
  interface RedisCommander<Context> {
    getetatasks(key: string, argv: string, callback?: Callback<string[]>): Result<string[], Context>;
  }
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
  public waitTimeout: Duration;
  public maxMemPercent: number;
  public maxTasksPerWorker: number;
  public workerLogFile?: string;
  public schedulerLogFile?: string;
  public workerLogLevel: string;
  public schedulerLogLevel: string;
  public logger?: Logger;

  public currentTask?: Task;
  public brokerKeys: string[];

  public afterWorkerStartedCallback?: () => void;
  public beforeTaskStartedCallback?: () => void;
  public afterTaskFinishedCallback?: () => void;
  // public wrapTasksFunction?: ((...arg0: any[]) => Promise<void>) => void;

  public broadcastKey = 'wakaq-broadcast';

  constructor(
    queues: WakaQueue[] = [],
    schedules: CronTask[] = [],
    host: string = 'localhost',
    port: number = 6379,
    db = 0,
    concurrency = 0,
    excludeQueues: string[] = [],
    maxRetries = 0,
    softTimeout: Duration | number = 0,
    hardTimeout: Duration | number = 0,
    maxMemPercent = 0,
    maxTasksPerWorker = 0,
    connectTimeout = 15000,
    keepAlive = 15000,
    noDelay = true,
    waitTimeout: Duration | number = 1,
    username: string | undefined = undefined,
    password: string | undefined = undefined,
    workerLogFile: string | undefined = undefined,
    schedulerLogFile: string | undefined = undefined,
    workerLogLevel: string | undefined = undefined,
    schedulerLogLevel: string | undefined = undefined,
    afterWorkerStartedCallback: (() => void) | undefined = undefined,
    beforeTaskStartedCallback: (() => void) | undefined = undefined,
    afterTaskFinishedCallback: (() => void) | undefined = undefined,
    // wrapTasksFunction?: ((...arg0: any[]) => Promise<void>) => void,
  ) {
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

    this.softTimeout = softTimeout instanceof Duration ? softTimeout : Duration.second(softTimeout);
    this.hardTimeout = hardTimeout instanceof Duration ? hardTimeout : Duration.second(hardTimeout);
    this.waitTimeout = waitTimeout instanceof Duration ? waitTimeout : Duration.second(waitTimeout);

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
    this.workerLogFile = workerLogFile;
    this.schedulerLogFile = schedulerLogFile;
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
    });
    this.broker.defineCommand('getetatasks', {
      numberOfKeys: 1,
      lua: ZRANGEPOP,
    });
    this.broker.on('error', (err) => {
      this.logger?.error(err);
    });
  }

  public registerTask(
    fn: (...arg0: any[]) => Promise<void>,
    queue?: WakaQueue | string,
    maxRetries?: number,
    softTimeout?: Duration,
    hardTimeout?: Duration,
  ) {
    const task = new Task(this, fn, queue, softTimeout, hardTimeout, maxRetries);
    if (this.tasks.has(task.name)) throw new WakaQError(`Duplicate task name: ${task.name}`);
    this.tasks.set(task.name, task);
    return task.fn;
  }

  /*
    task(fn=None, queue=None, max_retries=None, soft_timeout=None, hard_timeout=None) {
        def wrap(f):
            t = Task(
                fn=f,
                wakaq=this,
                queue=queue,
                max_retries=max_retries,
                soft_timeout=soft_timeout,
                hard_timeout=hard_timeout,
            )
            if t.name in this.tasks:
                raise Exception(f"Duplicate task name: {t.name}")
            this.tasks[t.name] = t
            return t.fn

        return wrap(fn) if fn else wrap
    }

    after_worker_started(this, callback) {
        this.after_worker_started_callback = callback
        return callback
    }

    before_task_started(this, callback) {
        this.before_task_started_callback = callback
        return callback
    }

    after_task_finished(this, callback) {
        this.after_task_finished_callback = callback
        return callback
    }

    wrap_tasks_with(this, callback) {
        this.wrap_tasks_function = callback
        return callback
    }
    */

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
    return await this.broker.publish(this.broadcastKey, payload);
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
