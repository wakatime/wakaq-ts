# ![logo](https://raw.githubusercontent.com/wakatime/wakaq/main/wakatime-logo.png "WakaQ") WakaQ
Background task queue for TypeScript backed by Redis, a super minimal Celery.
For the original Python version, see [WakaQ for Python][wakaq python].

## Features

* Queue priority
* Delayed tasks (run tasks after a timedelta eta)
* Scheduled periodic tasks
* [Broadcast][broadcast] a task to all workers
* Task [soft][soft timeout] and [hard][hard timeout] timeout limits
* Optionally retry tasks on soft timeout
* Combat memory leaks with `max_mem_percent` or `max_tasks_per_worker`
* Super minimal

Want more features like rate limiting, task deduplication, etc? Too bad, feature PRs are not accepted. Maximal features belong in your app’s worker tasks.

## Installing

    npm i -g wakaq

## Using

```TypeScript
coming soon
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
ExecStart=wakaq worker --app=path/to/your/wakaq.js
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



[wakaq python]: https://wakatime.com
[broadcast]: https://github.com/wakatime/wakaq/blob/2300ed220d1d9e65e3f9bf328e3059a124f6b529/wakaq/task.py#L47
[soft timeout]: https://github.com/wakatime/wakaq/blob/2300ed220d1d9e65e3f9bf328e3059a124f6b529/wakaq/exceptions.py#L8
[hard timeout]: https://github.com/wakatime/wakaq/blob/2300ed220d1d9e65e3f9bf328e3059a124f6b529/wakaq/worker.py#L400
[wakaq init]: https://github.com/wakatime/wakaq/blob/2300ed220d1d9e65e3f9bf328e3059a124f6b529/wakaq/__init__.py#L49
[max open ports]: https://wakatime.com/blog/47-maximize-your-concurrent-web-server-connections
