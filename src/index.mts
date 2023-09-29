#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ChildWorker } from './childWorker.js';
import { Scheduler } from './scheduler.js';
import { inspect, numPendingEtaTasksInQueue, numPendingTasksInQueue, purgeEtaQueue, purgeQueue } from './utils.js';
import { WakaQ } from './wakaq.js';
import { WakaWorker } from './worker.js';

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
      const module = (await import(argv.app)) as { wakaq: WakaQ };
      await new WakaWorker(module.wakaq, argv.app).start();
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
      const module = (await import(argv.app)) as { wakaq: WakaQ };
      await new Scheduler(module.wakaq).start();
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
      const module = (await import(argv.app)) as { wakaq: WakaQ };
      console.log(JSON.stringify(inspect(module.wakaq)));
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
      const module = (await import(argv.app)) as { wakaq: WakaQ };
      const wakaq = module.wakaq;
      const queue = wakaq.queuesByName.get(argv.queue);
      if (!queue) throw new Error(`Queue not found: ${argv.queue}`);
      let count = await numPendingTasksInQueue(wakaq, queue);
      await purgeQueue(wakaq, queue);
      count += await numPendingEtaTasksInQueue(wakaq, queue);
      await purgeEtaQueue(wakaq, queue);
      console.log(`Purged ${count} tasks from ${queue.name}`);
    },
  )
  .command(
    'child',
    false, // hidden command used internally to fork child worker processes
    (cmd) => {
      return cmd.option('app', {
        describe: 'Import path of your WakaQ instance.',
        demandOption: true,
        type: 'string',
      });
    },
    async (argv) => {
      const module = (await import(argv.app)) as { wakaq: WakaQ };
      await new ChildWorker(module.wakaq).start();
    },
  )
  .demandCommand(1)
  .parse();
