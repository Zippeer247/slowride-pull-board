// Which orders staff have marked pulled. The ONLY state this app keeps.
// Upstash Redis in production (shared by both screens), in-memory for local dev.

import { Redis } from "@upstash/redis";
import { config } from "./config";
import type { PulledInfo } from "./types";

const HASH = "pullboard:pulled";
const KEEP_DAYS = 30;

export interface PulledStore {
  all(): Promise<Record<string, PulledInfo>>;
  mark(key: string, info: PulledInfo): Promise<void>;
  undo(key: string): Promise<void>;
}

class MemoryStore implements PulledStore {
  private m = new Map<string, PulledInfo>();
  async all() {
    return Object.fromEntries(this.m);
  }
  async mark(key: string, info: PulledInfo) {
    this.m.set(key, info);
  }
  async undo(key: string) {
    this.m.delete(key);
  }
}

class RedisStore implements PulledStore {
  constructor(private r: Redis) {}
  async all() {
    return ((await this.r.hgetall<Record<string, PulledInfo>>(HASH)) ?? {}) as Record<string, PulledInfo>;
  }
  async mark(key: string, info: PulledInfo) {
    await this.r.hset(HASH, { [key]: info });
    // Prune old entries now and then so the hash stays small.
    if (Math.random() < 0.1) {
      const cutoff = Date.now() - KEEP_DAYS * 86400000;
      const old = Object.entries(await this.all())
        .filter(([, v]) => Date.parse(v.at) < cutoff)
        .map(([k]) => k);
      if (old.length) await this.r.hdel(HASH, ...old);
    }
  }
  async undo(key: string) {
    await this.r.hdel(HASH, key);
  }
}

const g = globalThis as unknown as { __pulledStore?: PulledStore };

export function pulledStore(): PulledStore {
  if (!g.__pulledStore) {
    const { url, token } = config().redis;
    g.__pulledStore = url && token ? new RedisStore(new Redis({ url, token })) : new MemoryStore();
  }
  return g.__pulledStore;
}
