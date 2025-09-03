# ![logo](https://raw.githubusercontent.com/wakatime/wakaq-ts/main/wakatime-logo.png 'WakaQ') WakaQ

[![wakatime](https://wakatime.com/badge/github/wakatime/wakaq-ts.svg)](https://wakatime.com/badge/github/wakatime/wakaq-ts)

Background task queue for TypeScript backed by Redis, a super minimal Celery.

For the original Python version, see [WakaQ for Python][wakaq python].

## Features

- TypeScript support for task params
- Queue priority
- Delayed tasks (run tasks after a duration eta)
- Scheduled periodic tasks
- [Broadcast][broadcast] a task to all workers
- Task [soft][soft timeout] and [hard][hard timeout] timeout limits
- Optionally retry tasks on soft timeout
- Combat memory leaks with `maxMemPercent` or `maxTasksPerWorker`
- Super minimal

Want more features like rate limiting, task deduplication, etc? Too bad, feature PRs are not accepted. Maximal features belong in your app’s worker tasks.

## Installing

    npm install wakaq

## Using

`app.ts`

```TypeScript
import { Duration } from 'ts-duration';
import { CronTask, WakaQ, WakaQueue, WakaQWorker } from 'wakaq';
import { db } from './drizzle';

export const wakaq = new WakaQ({

  /* Raise SoftTimeout in a task if it runs longer than 14 minutes. Can also be set per
     task or queue. If no soft timeout set, tasks can run forever.
  */
  softTimeout: Duration.minute(14),

  /* SIGKILL a task if it runs longer than 15 minutes. Can also be set per queue or
     when enqueuing a task.
  */
  hardTimeout: Duration.minute(15),

  /* Number of worker processes. Must be an int or str which evaluates to an
     int. The variable "cores" is replaced with the number of processors on
     the current machine.
  */
  concurrency: 'cores*4',

  /* List your queues and their priorities.
  */
  queues: [
    new WakaQueue('high priority'),
    new WakaQueue('default'),
  ],

  /* Redis normally doesn't use TLS, but some cloud providers need it.
  */
  tls: process.env.NODE_ENV == 'production' ? { cert: '', key: '' } : undefined,

  /* If the task soft timeouts, retry up to 3 times. Max retries comes first
     from the task decorator if set, next from the Queue's maxRetries,
     lastly from the option below. If No maxRetries is found, the task
     is not retried on a soft timeout.
  */
  maxRetries: 3,

  /* Schedule two tasks, the first runs every minute, the second once every ten minutes.
     To run scheduled tasks you must keep `npm run scheduler` running as a daemon.
  */
  schedules: [

    // Runs myTask once every 5 minutes.
    new CronTask('*/5 * * * *', 'myTask'),
  ],
});

export const createUserInBackground = wakaq.task(
  async (params: {firstName: string}) => {
    await db.insert(User).values({
      firstName: params.firstName,
    });
  },
  { name: 'createUserInBackground' },
);

```

Add these scripts to your `package.json`:

```JSON
{
  "scripts": {
    "worker": "tsx scripts/wakaqWorker.ts",
    "scheduler": "tsx scripts/wakaqScheduler.ts",
    "info": "tsx scripts/wakaqInfo.ts",
    "purge": "tsx scripts/wakaqPurge.ts"
  }
}
```

Create these files in your `scripts` folder:

`scripts/wakaqWorker.ts`

```TypeScript
import { WakaQWorker } from 'wakaq';
import { wakaq } from '../app.js';

// Can't use tsx directly because it breaks IPC (https://github.com/esbuild-kit/tsx/issues/201)
await new WakaQWorker(wakaq, ['node', '--no-warnings=ExperimentalWarning', '--import', 'tsx', 'scripts/wakaqChild.ts']).start();
process.exit(0);
```

`scripts/wakaqScheduler.ts`

```TypeScript
import { WakaQScheduler } from 'wakaq';
import { wakaq } from '../app.js';

await new WakaQScheduler(wakaq).start();
process.exit(0);
```

`scripts/wakaqChild.ts`

```TypeScript
import { WakaQChildWorker } from 'wakaq';
import { wakaq } from '../app.js';

// import your tasks so they're registered
// also make sure to enable tsc option verbatimModuleSyntax

await new WakaQChildWorker(wakaq).start();
process.exit(0);
```

`scripts/wakaqInfo.ts`

```TypeScript
import { inspect } from 'wakaq';
import { wakaq } from '../app.js';
console.log(JSON.stringify(await inspect(await wakaq.connect()), null, 2));
wakaq.disconnect();
```

`scripts/wakaqPurge.ts`

```TypeScript
import { numPendingTasksInQueue, numPendingEtaTasksInQueue, purgeQueue, purgeEtaQueue } from 'wakaq';
import { wakaq } from '../app.js';

const queueName = process.argv.slice(2)[0];
const queue = wakaq.queuesByName.get(queueName ?? '');
if (!queue) {
  throw new Error(`Queue not found: ${queueName}`);
}
await wakaq.connect();
let count = await numPendingTasksInQueue(wakaq, queue);
await purgeQueue(wakaq, queue);
count += await numPendingEtaTasksInQueue(wakaq, queue);
await purgeEtaQueue(wakaq, queue);
console.log(`Purged ${count} tasks from ${queue.name}`);
wakaq.disconnect();
```

After running `npm run worker` when you run `createUserInBackground.enqueue({firstName: 'alan'})` your task executes in the background on the worker server.

## Deploying

#### Optimizing

See the [WakaQ init params][wakaq init] for a full list of options, like Redis host and Redis socket timeout values.

When using in production, make sure to [increase the max open ports][max open ports] allowed for your Redis server process.

When using eta tasks a Redis sorted set is used, so eta tasks are automatically deduped based on task name, args, and kwargs.
If you want multiple pending eta tasks with the same arguments, just add a throwaway random string or uuid to the task’s args.

#### Running as a Daemon

Here’s an example systemd config to run `wakaq worker` as a daemon:

```systemd
[Unit]
Description=WakaQ Worker Service

[Service]
WorkingDirectory=/opt/yourapp
ExecStart=npm run worker
RemainAfterExit=no
Restart=always
RestartSec=30s
KillSignal=SIGINT
LimitNOFILE=99999

[Install]
WantedBy=multi-user.target
```

Create a file at `/etc/systemd/system/wakaqworker.service` with the above contents, then run:

    systemctl daemon-reload && systemctl enable wakaqworker

[wakaq python]: https://github.com/wakatime/wakaq
[broadcast]: https://github.com/wakatime/wakaq-ts/blob/v1.0.0/src/task.ts#L61
[soft timeout]: https://github.com/wakatime/wakaq-ts/blob/v1.0.0/src/childWorker.ts#L98
[hard timeout]: https://github.com/wakatime/wakaq-ts/blob/v1.0.0/src/worker.ts#L194
[wakaq init]: https://github.com/wakatime/wakaq-ts/blob/v1.0.0/src/wakaq.ts#L27
[max open ports]: https://wakatime.com/blog/47-maximize-your-concurrent-web-server-connections
