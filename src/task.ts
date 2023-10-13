import { Duration } from 'ts-duration';
import { WakaQError } from './exceptions.js';
import { WakaQueue } from './queue.js';
import { WakaQ } from './wakaq.js';

export class Task {
  public name: string;
  public fn: (...args: unknown[]) => Promise<void>;
  public wakaq: WakaQ;
  public queue?: WakaQueue;
  public softTimeout?: Duration;
  public hardTimeout?: Duration;
  public maxRetries: number;

  constructor(
    wakaq: WakaQ,
    fn: (...args: unknown[]) => Promise<void>,
    queue?: WakaQueue | string,
    softTimeout?: Duration,
    hardTimeout?: Duration,
    maxRetries?: number,
  ) {
    if (!fn.name) throw new Error(`Every WakaQ task needs a name, for ex:\nconst mytask = () => {}\nexport default wakaq.task(mytask);`);
    this.fn = fn;
    this.name = fn.name;
    this.wakaq = wakaq;
    if (queue) this.queue = WakaQueue.create(queue, this.wakaq.queuesByName);

    this.softTimeout = softTimeout;
    this.hardTimeout = hardTimeout;

    if (this.softTimeout && this.hardTimeout && this.hardTimeout <= this.softTimeout)
      throw new WakaQError(`Task hard timeout (${this.hardTimeout}) can not be less than or equal to soft timeout (${this.softTimeout}).`);

    this.maxRetries = Math.round(maxRetries ?? 0);
  }

  /*
  Run task in the background.
  */
  public async delay(...args: any[]) {
    // queue?: WakaQueue | string, eta?: Duration | Date | number,
    //queue = queue ?? this.queue;
    // if (eta) {
    //  const etaVerified = typeof eta === 'number' ? Duration.second(eta) : eta;
    //  return await this.wakaq.enqueueWithEta(this.name, args, etaVerified, queue);
    //} else {
    return await this.wakaq.enqueueAtEnd(this.name, args, this.queue);
    //}
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
