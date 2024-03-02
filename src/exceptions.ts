export class WakaQError extends Error {
  constructor(msg: string) {
    super(msg);
    Object.setPrototypeOf(this, WakaQError.prototype);
  }
}

export class SoftTimeout extends WakaQError {
  constructor(msg = 'soft timeout') {
    super(msg);
    Object.setPrototypeOf(this, SoftTimeout.prototype);
  }
}

export class PreventTaskExecution extends WakaQError {
  constructor(msg = 'prevent task execution') {
    super(msg);
    Object.setPrototypeOf(this, PreventTaskExecution.prototype);
  }
}
