export class WakaQError extends Error {
  constructor(msg: string) {
    super(msg);
    Object.setPrototypeOf(this, WakaQError.prototype);
  }
}

export class SoftTimeout extends WakaQError {
  constructor(msg: string) {
    super(msg);
    Object.setPrototypeOf(this, SoftTimeout.prototype);
  }
}
