import { Duration } from 'ts-duration';
import { type Logger } from 'winston';
import { CronTask } from './cronTask.js';
import { WakaQError } from './exceptions.js';
import { setupLogging } from './logger.js';
import { WakaQ } from './wakaq.js';

export class WakaQScheduler {
  public wakaq: WakaQ;
  public logger: Logger;

  constructor(wakaq: WakaQ) {
    this.wakaq = wakaq;
    this.logger = setupLogging(this.wakaq, false, true);
    this.wakaq.logger = this.logger;
  }

  async start() {
    this.logger.info(`scheduler_log_file=${this.wakaq.schedulerLogFile}`);
    this.logger.info(`scheduler_log_level=${this.wakaq.schedulerLogLevel}`);
    this.logger.info(`num_scheduled_tasks=${this.wakaq.schedules.length}`);
    this.logger.info(`default_queue=${this.wakaq.defaultQueue.name}`);

    if (this.wakaq.schedules.length == 0) {
      this.logger.error('no scheduled tasks found');
      throw new WakaQError('No scheduled tasks found.');
    }

    this.wakaq.schedules.forEach((task) => {
      this.logger.info(`scheduled task "${task.taskName}" with schedule ${task.schedule}`);
    })
    this.logger.info('scheduler started');

    let upcomingTasks: CronTask[] = [];

    try {
      await this.wakaq.connect();

      while (true) {
        this.logger.debug(`Iteration at ${(new Date()).toISOString()}`);
        this.logger.debug(`Number upcoming tasks this iteration: ${upcomingTasks.length}`);

        upcomingTasks.forEach((cronTask) => {
          const task = this.wakaq.tasks.get(cronTask.taskName);
          if (task) {
            const queue = cronTask.queue ?? task?.queue ?? this.wakaq.defaultQueue;

            this.logger.debug(`run scheduled task on queue ${queue.name}: ${task.name}`);
            this.wakaq.enqueueAtFront(task.name, cronTask.args, queue);
          }
        });

        const crons = this.wakaq.schedules.map((cronTask) => {
          return { duration: Duration.millisecond(Math.round(Date.now() - cronTask.interval.next().getTime())), cronTask: cronTask };
        });

        this.logger.debug(`Deciding how long to sleep from ${crons.length} tasks.`);
        const sleepDuration = crons
          .map((cron) => cron.duration)
          .reduce((prev, next) => {
            this.logger.debug(`Comparing previous ${prev.milliseconds} to ${next.milliseconds}`);
            return next.milliseconds < prev.milliseconds ? next : prev;
          }, Duration.hour(24));

        upcomingTasks = crons.filter((cron) => cron.duration.minutes < sleepDuration.minutes).map((cron) => cron.cronTask);

        const sleepUntil = new Date(Date.now() + sleepDuration.milliseconds);
        this.logger.debug(`Sleeping for ${sleepDuration.minutes} minutes until ${sleepUntil.toISOString()}`)

        // sleep until the next scheduled task
        await this.wakaq.sleep(sleepDuration);
      }
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.wakaq.disconnect();
    }
  }
}
