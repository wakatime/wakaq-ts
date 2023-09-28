import { Duration } from 'ts-duration';

function replacer(key: string, v: any): string | number | boolean | null {
  // @ts-ignore: Object is possibly 'null'
  const orig = this[key];

  switch (typeof orig) {
    case 'bigint':
      return orig.toString();
    case 'boolean':
    case 'number':
      return v;
    case 'object':
      if (orig instanceof Date) {
        return JSON.stringify({
          __class__: 'Date',
          iso: orig.toISOString(),
        });
      } else if (orig instanceof Duration) {
        return JSON.stringify({
          __class__: 'Duration',
          nanoseconds: orig.nanoseconds,
        });
      }
      return v;
    case 'string':
      return JSON.stringify(v);
    case 'undefined':
      return null;
  }
  return v;
}

function reviver(key: string, value: any): any {
  // TODO: deserialize Date, Duration, and bigint
  if (typeof value === 'object') {
    return value;
  }
  return value;
}

export const serialize = (obj: any): string => {
  return JSON.stringify(obj, replacer);
};

export const deserialize = (jsonStr: string): any => {
  return JSON.parse(jsonStr, reviver);
};
