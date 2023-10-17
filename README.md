# ![logo](https://raw.githubusercontent.com/wakatime/wakaq-ts/main/wakatime-logo.png 'WakaQ') WakaQ

Background task queue for TypeScript backed by Redis, a super minimal Celery.

For the original Python version, see [WakaQ for Python][wakaq python].

## Features

- Queue priority
- Delayed tasks (run tasks after a timedelta eta)
- Scheduled periodic tasks
- [Broadcast][broadcast] a task to all workers
- Task [soft][soft timeout] and [hard][hard timeout] timeout limits
- Optionally retry tasks on soft timeout
- Combat memory leaks with `maxMemPercent` or `maxTasksPerWorker`
- Super minimal

Want more features like rate limiting, task deduplication, etc? Too bad, feature PRs are not accepted. Maximal features belong in your app’s worker tasks.

## Installing

    npm i --save wakaq

## Using

`app.ts`

```TypeScript
import { WakaQ, WakaQWorker } from 'wakaq';
export const wakaq = new WakaQ();
```

Add these scripts to your `package.json`:

```JSON
{
  "scripts": {
    "worker": "tsx scripts/wakaqWorker.ts",
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
await new WakaQWorker(wakaq, ['node', '--loader', 'tsx', 'scripts/wakaqChild.ts']).start();
```

`scripts/wakaqChild.ts`

```TypeScript
import { WakaQChildWorker } from 'wakaq';
import { wakaq } from '../app.js';

// import your tasks so they're registered
// also make sure to enable tsc option verbatimModuleSyntax

await new WakaQChildWorker(wakaq).start();
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
