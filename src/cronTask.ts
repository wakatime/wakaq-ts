import { type CronExpression, parseExpression } from 'cron-parser';
import { WakaQueue } from './queue';
import { WakaQError } from './exceptions';

export class CronTask {
  public schedule: string;
  public interval: CronExpression;
  public taskName: string;
  public queue?: WakaQueue;
  public args: any[];

  constructor(schedule: string, taskName: string, queue?: WakaQueue, args: any[] = []) {
    try {
      this.interval = parseExpression(schedule);
    } catch (err) {
      throw new WakaQError(`Invalid cron schedule (min hour dom month dow) ${schedule}: ${err}`);
    }

    this.schedule = schedule;
    this.taskName = taskName;
    this.queue = queue;
    this.args = args;
  }
}
