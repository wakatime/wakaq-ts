# CHANGES

## 2.3.0 (2025-06-14) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.2.2...v2.3.0)

#### Feature

- Generic type support for tasks.

## 2.2.2 (2025-01-04) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.2.1...v2.2.2)

#### Bugfix

- Remove noisy debug log.

## 2.2.1 (2024-03-02) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.2.0...v2.2.1)

#### Bugfix

- Await async wrapper functions.

## 2.2.0 (2024-03-02) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.12...v2.2.0)

#### Feature

- Ability to prevent task execution from beforeTaskStartedCallback wrapper.

## 2.1.12 (2024-02-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.11...v2.1.12)

#### Bugfix

- Always run scheduled tasks even if not found in wakaq task list.

## 2.1.11 (2024-02-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.10...v2.1.11)

#### Bugfix

- Set context correctly when enqueuing tasks to run.

## 2.1.10 (2024-02-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.9...v2.1.10)

#### Bugfix

- Find scheduled tasks ready to run within or equal to next runtime.

## 2.1.9 (2024-02-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.8...v2.1.9)

#### Bugfix

- Fix arithmatic bug causing negative next cron interval time.

## 2.1.8 (2024-02-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.7...v2.1.8)

#### Bugfix

- Always sleep into the future not the past.

## 2.1.7 (2024-02-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.6...v2.1.7)

#### Bugfix

- Reset cron interval to current iteration time.

## 2.1.6 (2024-02-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.5...v2.1.6)

#### Bugfix

- Fix calculating sleep duration from next scheduled task.

## 2.1.5 (2024-02-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.4...v2.1.5)

#### Misc

- More verbose scheduler logging.

## 2.1.4 (2024-02-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.3...v2.1.4)

#### Bugfix

- Compare sleep until as milliseconds integer not Duration object.

## 2.1.3 (2024-02-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.2...v2.1.3)

#### Misc

- Improve scheduler logging.

## 2.1.2 (2023-12-07) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.1...v2.1.2)

#### Bugfix

- Fix concurrency param type.
- Fix proxying child worker log output.

## 2.1.1 (2023-11-25) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.1.0...v2.1.1)

#### Bugfix

- Fix tls connection options type.
- Skip validating unused params in singleProcess mode.

## 2.1.0 (2023-11-25) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.0.3...v2.1.0)

#### Feature

- New single process mode.

#### Bugfix

- Improve parsing concurrency param.

## 2.0.3 (2023-11-22) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.0.2...v2.0.3)

#### Misc

- Less noisy default logging.

## 2.0.2 (2023-11-21) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.0.1...v2.0.2)

#### Bugfix

- Use timeouts in seconds.

## 2.0.1 (2023-11-20) [commits](https://github.com/wakatime/wakaq-ts/compare/v2.0.0...v2.0.1)

#### Bugfix

- Fix logger format.

## 2.0.0 (2023-11-20) [commits](https://github.com/wakatime/wakaq-ts/compare/v1.0.1...v2.0.0)

#### Breaking

- Rename delay to enqueue to reduce confusion.

#### Bugfix

- Show full stacktrace in error logs.

## 1.0.1 (2023-10-17) [commits](https://github.com/wakatime/wakaq-ts/compare/v1.0.0...v1.0.1)

#### Bugfix

- Fix scheduler.

## 1.0.0 (2023-10-17) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.18...v1.0.0)

#### Misc

- Verified working, bump version to stable.

## 0.0.18 (2023-10-17) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.17...v0.0.18)

#### Bugfix

- Allow manually setting task names.

## 0.0.17 (2023-10-16) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.16...v0.0.17)

#### Misc

- Allow setting TLS on Redis connection.

## 0.0.16 (2023-10-16) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.15...v0.0.16)

#### Bugfix

- Create pubsub connection from scratch instead of duplicating main Redis connection.

## 0.0.15 (2023-10-16) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.14...v0.0.15)

#### Misc

- Log host, port, and db when worker first starts.

## 0.0.14 (2023-10-16) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.13...v0.0.14)

#### Bugfix

- Working MVP.

## 0.0.13 (2023-10-12) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.12...v0.0.13)

#### Misc

- Not working... debugging tsx bug with ipc.

## 0.0.12 (2023-10-10) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.11...v0.0.12)

#### Bugfix

- Fix returning default queue.

## 0.0.11 (2023-10-10) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.10...v0.0.11)

#### Bugfix

- Fix type of expected function.

## 0.0.10 (2023-10-10) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.9...v0.0.10)

#### Bugfix

- Use task wrapper instead of decorator.

## 0.0.9 (2023-10-09) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.8...v0.0.9)

#### Bugfix

- New dispose method to cleanup Redis connections.

## 0.0.8 (2023-10-06) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.7...v0.0.8)

#### Misc

- Use params object for WakaQ constructor.

## 0.0.7 (2023-10-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.6...v0.0.7)

#### Bugfix

- Build before publish.

## 0.0.6 (2023-10-05) [commits](https://github.com/wakatime/wakaq-ts/compare/0.0.5...v0.0.6)

#### Misc

- Setup as commonjs library.

## 0.0.5 (2023-10-05) [commits](https://github.com/wakatime/wakaq-ts/compare/0.0.4...0.0.5)

#### Bugfix

- Fix package.json.

## 0.0.4 (2023-10-05) [commits](https://github.com/wakatime/wakaq-ts/compare/0.0.3...0.0.4)

#### Misc

- Add types.

## 0.0.3 (2023-10-05) [commits](https://github.com/wakatime/wakaq-ts/compare/0.0.2...0.0.3)

#### Bufix

- Require using as library not cli.

## 0.0.2 (2023-09-29) [commits](https://github.com/wakatime/wakaq-ts/compare/0.0.1...0.0.2)

#### Bufix

- Fork process using child command.
- Implement custom json serializer.
- Import wakaq from module path.
- Upgrade to native EMS.
- Support killing a child worker when mem usage above defined percent.

#### Misc

- Add editor config for vscode.

## 0.0.1 (2023-09-28)

- Initial release.
