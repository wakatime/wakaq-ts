import { type ChildProcess } from 'node:child_process';
import { Duration } from 'ts-duration';
import { WakaQueue } from './queue.js';
import { Task } from './task.js';
import { WakaQ } from './wakaq.js';

export class Child {
  public process: ChildProcess;
  public done: boolean = false;
  public lastPing: number;
  public softTimeout: Duration;
  public hardTimeout: Duration;
  public softTimeoutReached = false;
  public outputBuffer = '';

  private _sigtermSent = false;
  private _sigquitSent = false;

  constructor(wakaq: WakaQ, process: ChildProcess) {
    this.process = process;
    this.lastPing = Math.round(Date.now() / 1000);
    this.softTimeout = wakaq.softTimeout;
    this.hardTimeout = wakaq.hardTimeout;
  }

  public sigterm() {
    if (this._sigtermSent) return;
    this.process.kill('SIGTERM');
    this._sigtermSent = true;
  }

  public sigkill() {
    this.process.kill('SIGKILL');
  }

  public sigquit() {
    if (this._sigquitSent) return;
    this.process.kill('SIGQUIT');
    this._sigquitSent = true;
  }

  public setTimeouts(wakaq: WakaQ, task?: Task, queue?: WakaQueue) {
    this.softTimeout = wakaq.softTimeout;
    this.hardTimeout = wakaq.hardTimeout;
    if (task && task.softTimeout) this.softTimeout = task.softTimeout;
    else if (queue && queue.softTimeout) this.softTimeout = queue.softTimeout;
    if (task && task.hardTimeout) this.hardTimeout = task.hardTimeout;
    else if (queue && queue.hardTimeout) this.hardTimeout = queue.hardTimeout;
  }
}
