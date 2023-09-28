import { Duration } from 'ts-duration';
import { type Logger } from 'winston';
import { CronTask } from './cronTask';
import { WakaQError } from './exceptions';
import { setupLogging } from './logger';
import { WakaQ } from './wakaq';

export class Scheduler {
  public wakaq: WakaQ;
  public logger: Logger;

  constructor(wakaq: WakaQ) {
    this.wakaq = wakaq;
    this.logger = setupLogging(this.wakaq, false, true);
    this.wakaq.logger = this.logger;
  }

  async start() {
    this.logger.info('starting scheduler');

    if (this.wakaq.schedules.length == 0) {
      this.logger.error('no scheduled tasks found');
      throw new WakaQError('No scheduled tasks found.');
    }

    let upcomingTasks: CronTask[] = [];
    while (true) {
      upcomingTasks.forEach((cronTask) => {
        const task = this.wakaq.tasks.get(cronTask.taskName);
        if (task) {
          const queue = cronTask.queue ?? task?.queue ?? this.wakaq.defaultQueue;

          this.logger.debug(`run scheduled task on queue ${queue.name}: ${task.name}`);
          this.wakaq.enqueueAtFront(task.name, cronTask.args, queue);
        }
      });

      const crons = this.wakaq.schedules.map((cronTask) => {
        return { duration: Duration.second(Math.round(cronTask.interval.next().getTime() / 1000)), cronTask: cronTask };
      });
      const sleepDuration = crons
        .map((cron) => cron.duration)
        .reduce((current, next) => {
          return next < current ? next : current;
        }, Duration.hour(24));

      upcomingTasks = crons.filter((cron) => cron.duration.minutes < sleepDuration.minutes).map((cron) => cron.cronTask);

      // sleep until the next scheduled task
      await this.wakaq.sleep(sleepDuration);
    }
  }
}
