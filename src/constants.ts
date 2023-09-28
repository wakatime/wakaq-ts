export const ZRANGEPOP =
  "local results = redis.call('ZRANGEBYSCORE', KEYS[1], 0, ARGV[1])\nredis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])\nreturn results";
