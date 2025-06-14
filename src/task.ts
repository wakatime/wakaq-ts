import { Duration } from 'ts-duration';
import { WakaQError } from './exceptions.js';
import { WakaQueue } from './queue.js';
import { WakaQ } from './wakaq.js';

export class Task<TData = unknown> {
  public name: string;
  public fn: (variables: TData) => Promise<void>;
  public wakaq: WakaQ;
  public queue?: WakaQueue;
  public softTimeout?: Duration;
  public hardTimeout?: Duration;
  public maxRetries: number;

  constructor(
    wakaq: WakaQ,
    fn: (variables: TData) => Promise<void>,
    name?: string,
    queue?: WakaQueue | string,
    softTimeout?: Duration,
    hardTimeout?: Duration,
    maxRetries?: number,
  ) {
    if (!name && !fn.name)
      throw new Error(`Every WakaQ task needs a name, for ex:\nconst mytask = () => {}\nexport default wakaq.task(mytask);`);
    this.fn = fn;
    this.name = name ?? fn.name;
    this.wakaq = wakaq;
    if (queue) this.queue = WakaQueue.create(queue, this.wakaq.queuesByName);

    this.softTimeout = softTimeout;
    this.hardTimeout = hardTimeout;

    if (this.softTimeout && this.hardTimeout && this.hardTimeout.seconds <= this.softTimeout.seconds)
      throw new WakaQError(
        `Task hard timeout (${this.hardTimeout.seconds}) can not be less than or equal to soft timeout (${this.softTimeout.seconds}).`,
      );

    this.maxRetries = Math.round(maxRetries ?? 0);
  }

  /*
  Run task in the background.
  */
  public async enqueue(variables: TData) {
    return await this.wakaq.enqueueAtEnd(this.name, variables, this.queue);
  }

  /*
  Run task in the background after eta.
  */
  public async enqueueAfterDelay(eta: Duration | Date | number, ...args: any[]) {
    const etaVerified = typeof eta === 'number' ? Duration.second(eta) : eta;
    return await this.wakaq.enqueueWithEta(this.name, args, etaVerified, this.queue);
  }

  /*
  Run task in the background on all workers.

  Only runs the task once per worker parent daemon, no matter the worker's concurrency.
  Returns the number of workers the task was sent to.
  */
  public async broadcast(...args: any[]): Promise<number> {
    return await this.wakaq.broadcast(this.name, args);
  }
}
