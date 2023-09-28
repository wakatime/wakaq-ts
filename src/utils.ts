import { Duration } from 'ts-duration';
import { WakaQError } from './exceptions';
import { WakaQueue } from './queue';
import { deserialize, serialize } from './serializer';
import { type WakaQ } from './wakaq';

export interface QueuesInfo {
  queues: Map<string, QueuesInfoQueue>;
  workers: number;
}

export interface QueuesInfoQueue {
  name: string;
  priority: number;
  broker_key: string;
  broker_eta_key: string;
  pending_tasks: number;
  pending_eta_tasks: number;
}

export const inspect = async (wakaq: WakaQ): Promise<QueuesInfo> => {
  const results = await Promise.all(
    wakaq.queues.map(async (q) => {
      return {
        name: q.name,
        priority: q.priority,
        broker_key: q.brokerKey,
        broker_eta_key: q.brokerEtaKey,
        pending_tasks: await numPendingTasksInQueue(wakaq, q),
        pending_eta_tasks: await numPendingEtaTasksInQueue(wakaq, q),
      };
    }),
  );
  const workers = await numWorkersConnected(wakaq);
  return {
    queues: new Map<string, QueuesInfoQueue>(
      results.map((q) => {
        return [q.name, q];
      }),
    ),
    workers,
  };
};

export const pendingTasksInQueue = async (wakaq: WakaQ, queue?: WakaQueue | string, limit: number = 0) => {
  if (typeof queue === 'string') {
    queue = wakaq.queuesByName.get(queue);
  }
  if (!queue) return [];

  const tasks = await wakaq.broker.lrange(queue.brokerKey, 0, limit - 1);
  return tasks.map((task) => serialize(task));
};

export const pendingEtaTasksInQueue = async (
  wakaq: WakaQ,
  queue: WakaQueue | string,
  before: Date | Duration | number,
  limit: number = 0,
  offset: number = 0,
) => {
  if (typeof queue === 'string') {
    const q = wakaq.queuesByName.get(queue);
    if (!q) return [];
    queue = q;
  }

  let params: string[] = [];
  let cmd: string;
  if (before) {
    cmd = 'ZRANGEBYSCORE';
    if (before instanceof Duration) {
      before = (new Date().getTime() + before.milliseconds) / 1000;
    } else if (before instanceof Date) {
      before = before.getTime() / 1000;
    }
    params.push('0');
    params.push(String(Math.round(before)));
    params.push('WITHSCORES');
    if (limit) {
      params.push('LIMIT');
      params.push(String(offset));
      params.push(String(limit));
    }
  } else {
    cmd = 'ZRANGE';
    params.push(String(offset));
    params.push(String(limit - 1));
    params.push('WITHSCORES');
  }

  const tasks = (await wakaq.broker.call(cmd, queue.brokerEtaKey, ...params)) as string[];

  let payloads: any[] = [];
  for (var i = 0; i < tasks.length; i += 2) {
    const payload = deserialize(tasks[i] as string);
    payload['eta'] = tasks[i + 1];
    payloads.push(payload);
  }
  return payloads;
};

export const numPendingTasksInQueue = async (wakaq: WakaQ, queue: WakaQueue | string) => {
  if (typeof queue === 'string') {
    const q = wakaq.queuesByName.get(queue);
    if (!q) throw new WakaQError(`Invalid queue: ${queue}`);
    queue = q;
  }
  return await wakaq.broker.llen(queue.brokerKey);
};

export const numPendingEtaTasksInQueue = async (wakaq: WakaQ, queue: WakaQueue | string) => {
  if (typeof queue === 'string') {
    const q = wakaq.queuesByName.get(queue);
    if (!q) throw new WakaQError(`Invalid queue: ${queue}`);
    queue = q;
  }
  return await wakaq.broker.zcount(queue.brokerEtaKey, '-inf', '+inf');
};

export const numWorkersConnected = async (wakaq: WakaQ) => {
  return Number((await wakaq.broker.pubsub('NUMSUB', wakaq.broadcastKey))[1]);
};

export const purgeQueue = async (wakaq: WakaQ, queue: WakaQueue | string) => {
  if (typeof queue === 'string') {
    const q = wakaq.queuesByName.get(queue);
    if (!q) throw new WakaQError(`Invalid queue: ${queue}`);
    queue = q;
  }
  return await wakaq.broker.del(queue.brokerKey);
};

export const purgeEtaQueue = async (wakaq: WakaQ, queue: WakaQueue | string) => {
  if (typeof queue === 'string') {
    const q = wakaq.queuesByName.get(queue);
    if (!q) throw new WakaQError(`Invalid queue: ${queue}`);
    queue = q;
  }
  return await wakaq.broker.del(queue.brokerEtaKey);
};
