# CHANGES

## 1.0.1 (2022-10-17) [commits](https://github.com/wakatime/wakaq-ts/compare/v1.0.0...v1.0.1)

#### Bugfix

- Fix scheduler.

## 1.0.0 (2022-10-17) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.18...v1.0.0)

#### Misc

- Verified working, bump version to stable.

## 0.0.18 (2022-10-17) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.17...v0.0.18)

#### Bugfix

- Allow manually setting task names.

## 0.0.17 (2022-10-16) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.16...v0.0.17)

#### Misc

- Allow setting TLS on Redis connection.

## 0.0.16 (2022-10-16) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.15...v0.0.16)

#### Bugfix

- Create pubsub connection from scratch instead of duplicating main Redis connection.

## 0.0.15 (2022-10-16) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.14...v0.0.15)

#### Misc

- Log host, port, and db when worker first starts.

## 0.0.14 (2022-10-16) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.13...v0.0.14)

#### Bugfix

- Working MVP.

## 0.0.13 (2022-10-12) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.12...v0.0.13)

#### Misc

- Not working... debugging tsx bug with ipc.

## 0.0.12 (2022-10-10) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.11...v0.0.12)

#### Bugfix

- Fix returning default queue.

## 0.0.11 (2022-10-10) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.10...v0.0.11)

#### Bugfix

- Fix type of expected function.

## 0.0.10 (2022-10-10) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.9...v0.0.10)

#### Bugfix

- Use task wrapper instead of decorator.

## 0.0.9 (2022-10-09) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.8...v0.0.9)

#### Bugfix

- New dispose method to cleanup Redis connections.

## 0.0.8 (2022-10-06) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.7...v0.0.8)

#### Misc

- Use params object for WakaQ constructor.

## 0.0.7 (2022-10-05) [commits](https://github.com/wakatime/wakaq-ts/compare/v0.0.6...v0.0.7)

#### Bugfix

- Build before publish.

## 0.0.6 (2022-10-05) [commits](https://github.com/wakatime/wakaq-ts/compare/0.0.5...v0.0.6)

#### Misc

- Setup as commonjs library.

## 0.0.5 (2022-10-05) [commits](https://github.com/wakatime/wakaq-ts/compare/0.0.4...0.0.5)

#### Bugfix

- Fix package.json.

## 0.0.4 (2022-10-05) [commits](https://github.com/wakatime/wakaq-ts/compare/0.0.3...0.0.4)

#### Misc

- Add types.

## 0.0.3 (2022-10-05) [commits](https://github.com/wakatime/wakaq-ts/compare/0.0.2...0.0.3)

#### Bufix

- Require using as library not cli.

## 0.0.2 (2022-09-29) [commits](https://github.com/wakatime/wakaq-ts/compare/0.0.1...0.0.2)

#### Bufix

- Fork process using child command.
- Implement custom json serializer.
- Import wakaq from module path.
- Upgrade to native EMS.
- Support killing a child worker when mem usage above defined percent.

#### Misc

- Add editor config for vscode.

## 0.0.1 (2022-09-28)

- Initial release.
