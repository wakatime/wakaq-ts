import { Duration } from 'ts-duration';
import { WakaQError } from './exceptions.js';
import { WakaQueue } from './queue.js';
import { WakaQ } from './wakaq.js';

export class Task {
  public name: string;
  public fn: any;
  public wakaq: WakaQ;
  public queue?: WakaQueue;
  public softTimeout?: Duration;
  public hardTimeout?: Duration;
  public maxRetries: number;

  constructor(
    wakaq: WakaQ,
    fn: (...args: any[]) => any,
    queue?: WakaQueue | string,
    softTimeout?: Duration,
    hardTimeout?: Duration,
    maxRetries?: number,
  ) {
    this.name = fn.name;
    this.wakaq = wakaq;
    if (queue) this.queue = WakaQueue.create(queue, this.wakaq.queuesByName);

    this.softTimeout = softTimeout;
    this.hardTimeout = hardTimeout;

    if (this.softTimeout && this.hardTimeout && this.hardTimeout <= this.softTimeout)
      throw new WakaQError(`Task hard timeout (${this.hardTimeout}) can not be less than or equal to soft timeout (${this.softTimeout}).`);

    this.maxRetries = Math.round(maxRetries ?? 0);

    const inner = (...innerargs: any[]) => {
      return fn(...innerargs);
    };

    inner.delay = this._delay;
    inner.broadcast = this._broadcast;

    this.fn = inner;
  }

  /*
  Run task in the background.
  */
  async _delay(queue?: WakaQueue | string, eta?: Duration | Date | number, ...args: any[]) {
    queue = queue ?? this.queue;
    if (eta) {
      const etaVerified = typeof eta === 'number' ? Duration.second(eta) : eta;
      return await this.wakaq.enqueueWithEta(this.name, args, etaVerified, queue);
    } else {
      return await this.wakaq.enqueueAtEnd(this.name, args, queue);
    }
  }

  /*
  Run task in the background on all workers.

  Only runs the task once per worker parent daemon, no matter the worker's concurrency.
  Returns the number of workers the task was sent to.
  */
  async _broadcast(...args: any[]): Promise<number> {
    return await this.wakaq.broadcast(this.name, args);
  }
}
