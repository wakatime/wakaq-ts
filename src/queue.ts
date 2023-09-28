import { Duration } from 'ts-duration';
import { WakaQError } from './exceptions';

export class WakaQueue {
  public name: string;
  public priority: number;
  public prefix: string;
  public softTimeout?: Duration;
  public hardTimeout?: Duration;
  public maxRetries?: number | null;

  constructor(name: string, priority: number = -1, prefix?: string, softTimeout?: Duration, hardTimeout?: Duration, maxRetries?: number) {
    this.prefix = (prefix ?? 'wakaq').replace(/[^a-zA-Z0-9_.-]/g, '');
    this.name = name.replace(/[^a-zA-Z0-9_.-]/g, '');

    if (isNaN(priority)) throw new Error(`Invalid queue priority: ${priority}`);
    this.priority = priority;

    this.softTimeout = softTimeout;
    this.hardTimeout = hardTimeout;

    if (this.softTimeout && this.hardTimeout && this.hardTimeout <= this.softTimeout) {
      throw new WakaQError(`Queue hard timeout (${this.hardTimeout}) cannot be less than or equal to soft timeout (${this.softTimeout}).`);
    }

    if (maxRetries && isNaN(maxRetries)) throw new Error(`Invalid queue max retries: ${maxRetries}`);
    this.maxRetries = maxRetries;
  }

  public static create(obj: any, queuesByName?: Map<string, WakaQueue>): WakaQueue {
    if (obj instanceof WakaQueue) {
      if (queuesByName !== undefined && !queuesByName.has(obj.name)) throw new Error(`Unknown queue: ${obj.name}`);
      return obj;
    } else if (Array.isArray(obj) && obj.length === 2) {
      if (typeof obj[0] === 'number') {
        if (queuesByName !== undefined && !queuesByName.has(obj[1])) throw new Error(`Unknown queue: ${obj[1]}`);
        return new WakaQueue(obj[1], obj[0]);
      } else {
        if (queuesByName !== undefined && !queuesByName.has(obj[0])) throw new Error(`Unknown queue: ${obj[0]}`);
        return new WakaQueue(obj[0], obj[1]);
      }
    } else {
      if (queuesByName !== undefined && !queuesByName.has(obj)) throw new Error(`Unknown queue: ${obj}`);
      return new WakaQueue(obj);
    }
  }

  public setDefaultPriority(lowestPriority: number) {
    if (this.priority < 0) this.priority = lowestPriority + 1;
  }

  get brokerKey(): string {
    return `${this.prefix}:${this.name}`;
  }

  get brokerEtaKey(): string {
    return `${this.prefix}:eta:${this.name}`;
  }
}
