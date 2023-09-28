#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Scheduler } from './scheduler';
import { inspect, numPendingEtaTasksInQueue, numPendingTasksInQueue, purgeEtaQueue, purgeQueue } from './utils';
import { WakaQ } from './wakaq';
import { WakaWorker } from './worker';

yargs(hideBin(process.argv))
  .usage('Usage: $0 <command> [options]')
  .command(
    'worker',
    'Run worker(s) to process tasks from queue(s) defined in your app.',
    (cmd) => {
      return cmd.option('app', {
        describe: 'Import path of your WakaQ instance.',
        demandOption: true,
        type: 'string',
      });
    },
    async (argv) => {
      const app = await import(argv.app);
      await new WakaWorker(app as WakaQ).start();
    },
  )
  .command(
    'scheduler',
    'Run a scheduler to enqueue periodic tasks based on a schedule defined in your app.',
    (cmd) => {
      return cmd.option('app', {
        describe: 'Import path of your WakaQ instance.',
        demandOption: true,
        type: 'string',
      });
    },
    async (argv) => {
      const app = await import(argv.app);
      await new Scheduler(app as WakaQ).start();
    },
  )
  .command(
    'info',
    'Inspect and print info about your queues.',
    (cmd) => {
      return cmd.option('app', {
        describe: 'Import path of your WakaQ instance.',
        demandOption: true,
        type: 'string',
      });
    },
    async (argv) => {
      const app = await import(argv.app);
      console.log(JSON.stringify(inspect(app as WakaQ)));
    },
  )
  .command(
    'purge',
    'Remove and empty all pending tasks in a queue.',
    (cmd) => {
      return cmd
        .option('app', {
          describe: 'Import path of your WakaQ instance.',
          demandOption: true,
          type: 'string',
        })
        .option('queue', {
          describe: 'Name of queue to purge.',
          demandOption: true,
          type: 'string',
        });
    },
    async (argv) => {
      const app = await import(argv.app);
      const wakaq = app as WakaQ;
      const queue = wakaq.queuesByName.get(argv.queue);
      if (!queue) throw new Error(`Queue not found: ${argv.queue}`);
      let count = await numPendingTasksInQueue(wakaq, queue);
      await purgeQueue(wakaq, queue);
      count += await numPendingEtaTasksInQueue(wakaq, queue);
      await purgeEtaQueue(wakaq, queue);
      console.log(`Purged ${count} tasks from ${queue.name}`);
    },
  )
  .demandCommand(1)
  .parse();
