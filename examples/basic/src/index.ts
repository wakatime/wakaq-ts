import { Duration } from 'ts-duration';
import { Level, WakaQ, WakaQueue } from 'wakaq';

export const wakaq = new WakaQ({
  queues: [new WakaQueue('test-queue')],
  concurrency: 6,
  hardTimeout: Duration.minute(3),
  host: process.env.REDIS_HOST,
  password: process.env.REDIS_PASSWORD,
  port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  workerLogLevel: process.env.NODE_ENV == 'development' ? Level.DEBUG : undefined,
  softTimeout: Duration.minute(2),
  tls: process.env.NODE_ENV == 'production' ? { host: process.env.REDIS_HOST } : undefined,
  username: process.env.REDIS_USERNAME,
  waitTimeout: Duration.second(10),
});

export const exampleTask = wakaq.task(
  async (name) => {
    wakaq.logger?.info('Task Started');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    wakaq.logger?.info('Task Ended');
    wakaq.logger?.info(`Hello, ${name}`);
  },
  { name: 'exampleTask' },
);
