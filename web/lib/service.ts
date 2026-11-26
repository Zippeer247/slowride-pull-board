// Glue: fetch both stores (cached briefly so two screens don't double the Shopify calls),
// build cards, apply pulled state.

import { applyPulled, buildCards } from "./board";
import { config } from "./config";
import { liveSource } from "./shopify/client";
import { mockSource } from "./shopify/mock";
import { pulledStore } from "./state";
import type { BoardResponse, Card, OrderSource, ShopifyOrder, StoreId } from "./types";

interface Fetched {
  at: number;
  garage: ShopifyOrder[] | null;
  supply: ShopifyOrder[] | null;
  errors: string[];
}

const g = globalThis as unknown as { __ordersCache?: Fetched; __ordersInflight?: Promise<Fetched> };

function source(): OrderSource {
  return config().source === "live" ? liveSource : mockSource;
}

async function fetchBoth(): Promise<Fetched> {
  const c = config();
  const errors: string[] = [];
  const one = async (store: StoreId) => {
    try {
      return await source().listOrders(store, c.since);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      return null;
    }
  };
  const [garage, supply] = await Promise.all([one("garage"), one("supply")]);
  return { at: Date.now(), garage, supply, errors };
}

async function orders(): Promise<Fetched> {
  const ttl = config().cacheSeconds * 1000;
  const cached = g.__ordersCache;
  if (cached && Date.now() - cached.at < ttl) return cached;
  if (!g.__ordersInflight) {
    g.__ordersInflight = fetchBoth().finally(() => {
      g.__ordersInflight = undefined;
    });
  }
  const fresh = await g.__ordersInflight;
  // If one store failed, keep its last good result rather than blanking the screen.
  const merged: Fetched = {
    ...fresh,
    garage: fresh.garage ?? cached?.garage ?? null,
    supply: fresh.supply ?? cached?.supply ?? null,
  };
  g.__ordersCache = merged;
  return merged;
}

export async function currentCards(): Promise<{ cards: Card[]; errors: string[] }> {
  const c = config();
  const o = await orders();
  const cards = buildCards(o.garage ?? [], o.supply ?? [], { mode: c.mode, since: c.since });
  return { cards, errors: o.errors };
}

export async function board(): Promise<BoardResponse> {
  const c = config();
  const now = new Date();
  const [{ cards, errors }, pulled] = await Promise.all([currentCards(), pulledStore().all()]);
  const { toPull, justPulled } = applyPulled(cards, pulled, now, c.undoMin);
  return {
    now: now.toISOString(),
    build: process.env.NEXT_PUBLIC_BUILD_ID ?? "",
    mode: c.mode,
    source: c.source,
    amberMin: c.amberMin,
    redMin: c.redMin,
    alarmMin: c.alarmMin,
    toPull,
    justPulled,
    errors,
  };
}
