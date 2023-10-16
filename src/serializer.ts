import { Duration } from 'ts-duration';

function replacer(key: string, v: any): object | string | number | boolean | null {
  // @ts-ignore: Object is possibly 'null'
  const orig = this[key];

  switch (typeof orig) {
    case 'bigint':
      return {
        __class__: 'BigInt',
        value: orig.toString(),
      };
    case 'boolean':
      return v;
    case 'number':
      if (orig === Infinity) {
        return {
          __class__: 'Infinity',
        };
      } else if (orig === -Infinity) {
        return {
          __class__: '-Infinity',
        };
      } else if (isNaN(orig)) {
        return {
          __class__: 'NaN',
        };
      }
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
      return v;
    case 'undefined':
      return {
        __class__: 'undefined',
      };
  }
  return v;
}

function reviver(key: string, value: any): any {
  if (typeof value === 'object') {
    if (typeof value.__type__ !== 'string') return value;
    switch (value.__type__ as string) {
      case 'NaN':
        return NaN;
      case 'Infinity':
        return Infinity;
      case '-Infinity':
        return -Infinity;
      case 'undefined':
        return undefined;
      case 'BigInt':
        return BigInt(value.value as string);
      case 'Date':
        return new Date(Date.parse(value.iso));
      case 'Duration':
        return Duration.nanosecond(value);
      default:
        return value;
    }
  }
  return value;
}

export const serialize = (obj: any): string => {
  return JSON.stringify(obj, replacer);
};

export const deserialize = (jsonStr: string): any => {
  return JSON.parse(jsonStr, reviver);
};
