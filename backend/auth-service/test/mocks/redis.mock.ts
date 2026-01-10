/**
 * Redis (ioredis) Mock
 * In-memory mock for Redis operations
 */

import { jest } from '@jest/globals';

type MockFn = ReturnType<typeof jest.fn>;

interface RedisValue {
  value: string;
  expiry?: number;
}

// In-memory Redis store
const store = new Map<string, RedisValue>();
const sets = new Map<string, Set<string>>();
const lists = new Map<string, string[]>();

/**
 * Check if a key has expired
 */
function isExpired(item: RedisValue): boolean {
  return !!item.expiry && Date.now() > item.expiry;
}

/**
 * Reset the Redis store
 */
export function resetRedisStore(): void {
  store.clear();
  sets.clear();
  lists.clear();
}

/**
 * Get a value from the store (for test assertions)
 */
export function getStoredValue(key: string): string | null {
  const item = store.get(key);
  if (!item || isExpired(item)) {
    return null;
  }
  return item.value;
}

/**
 * Set a value in the store (for test setup)
 */
export function setStoredValue(key: string, value: string, ttl?: number): void {
  store.set(key, {
    value,
    expiry: ttl ? Date.now() + ttl * 1000 : undefined,
  });
}

/**
 * Redis mock implementation
 */
export const redisMock = {
  // String operations
  get: jest.fn(async (key: string): Promise<string | null> => {
    const item = store.get(key);
    if (!item) return null;
    if (isExpired(item)) {
      store.delete(key);
      return null;
    }
    return item.value;
  }),

  set: jest.fn(async (key: string, value: string): Promise<'OK'> => {
    store.set(key, { value });
    return 'OK';
  }),

  setex: jest.fn(async (key: string, ttl: number, value: string): Promise<'OK'> => {
    store.set(key, {
      value,
      expiry: Date.now() + ttl * 1000,
    });
    return 'OK';
  }),

  del: jest.fn(async (...keys: string[]): Promise<number> => {
    let count = 0;
    for (const key of keys) {
      if (store.has(key)) {
        store.delete(key);
        count++;
      }
      if (sets.has(key)) {
        sets.delete(key);
        count++;
      }
      if (lists.has(key)) {
        lists.delete(key);
        count++;
      }
    }
    return count;
  }),

  expire: jest.fn(async (key: string, seconds: number): Promise<number> => {
    const item = store.get(key);
    if (item) {
      item.expiry = Date.now() + seconds * 1000;
      return 1;
    }
    return 0;
  }),

  ttl: jest.fn(async (key: string): Promise<number> => {
    const item = store.get(key);
    if (!item) return -2;
    if (!item.expiry) return -1;
    const remaining = Math.ceil((item.expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }),

  exists: jest.fn(async (...keys: string[]): Promise<number> => {
    let count = 0;
    for (const key of keys) {
      const item = store.get(key);
      if (item && !isExpired(item)) count++;
    }
    return count;
  }),

  // Set operations
  sadd: jest.fn(async (key: string, ...members: string[]): Promise<number> => {
    let set = sets.get(key);
    if (!set) {
      set = new Set();
      sets.set(key, set);
    }
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }
    return added;
  }),

  smembers: jest.fn(async (key: string): Promise<string[]> => {
    const set = sets.get(key);
    return set ? Array.from(set) : [];
  }),

  srem: jest.fn(async (key: string, ...members: string[]): Promise<number> => {
    const set = sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const member of members) {
      if (set.has(member)) {
        set.delete(member);
        removed++;
      }
    }
    return removed;
  }),

  sismember: jest.fn(async (key: string, member: string): Promise<number> => {
    const set = sets.get(key);
    return set?.has(member) ? 1 : 0;
  }),

  // List operations
  lpush: jest.fn(async (key: string, ...values: string[]): Promise<number> => {
    let list = lists.get(key);
    if (!list) {
      list = [];
      lists.set(key, list);
    }
    for (const value of values.reverse()) {
      list.unshift(value);
    }
    return list.length;
  }),

  rpush: jest.fn(async (key: string, ...values: string[]): Promise<number> => {
    let list = lists.get(key);
    if (!list) {
      list = [];
      lists.set(key, list);
    }
    list.push(...values);
    return list.length;
  }),

  lrange: jest.fn(async (key: string, start: number, stop: number): Promise<string[]> => {
    const list = lists.get(key);
    if (!list) return [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }),

  llen: jest.fn(async (key: string): Promise<number> => {
    const list = lists.get(key);
    return list ? list.length : 0;
  }),

  // Pipeline operations
  pipeline: jest.fn(() => {
    const commands: Array<{ method: string; args: any[] }> = [];

    const pipelineMock = {
      get: (key: string) => {
        commands.push({ method: 'get', args: [key] });
        return pipelineMock;
      },
      set: (key: string, value: string) => {
        commands.push({ method: 'set', args: [key, value] });
        return pipelineMock;
      },
      setex: (key: string, ttl: number, value: string) => {
        commands.push({ method: 'setex', args: [key, ttl, value] });
        return pipelineMock;
      },
      del: (...keys: string[]) => {
        commands.push({ method: 'del', args: keys });
        return pipelineMock;
      },
      sadd: (key: string, ...members: string[]) => {
        commands.push({ method: 'sadd', args: [key, ...members] });
        return pipelineMock;
      },
      srem: (key: string, ...members: string[]) => {
        commands.push({ method: 'srem', args: [key, ...members] });
        return pipelineMock;
      },
      exec: async () => {
        const results: [Error | null, any][] = [];
        for (const cmd of commands) {
          try {
            const fn = (redisMock as any)[cmd.method];
            const result = await fn(...cmd.args);
            results.push([null, result]);
          } catch (error) {
            results.push([error as Error, null]);
          }
        }
        return results;
      },
    };

    return pipelineMock;
  }),

  // Connection
  quit: jest.fn(async (): Promise<'OK'> => 'OK'),
  disconnect: jest.fn(),

  // Events
  on: jest.fn(),
  once: jest.fn(),
};

/**
 * Reset all Redis mocks
 */
export function resetRedisMocks(): void {
  resetRedisStore();
  Object.values(redisMock).forEach((mock) => {
    if (typeof mock === 'function' && 'mockClear' in mock) {
      (mock as MockFn).mockClear();
    }
  });
}

// Export the mock class constructor
export const RedisMockConstructor = jest.fn(() => redisMock);
