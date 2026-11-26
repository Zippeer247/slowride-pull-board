import { createHash, timingSafeEqual } from "node:crypto";
import type { BoardMode } from "./board";

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export function config() {
  const env = process.env;
  const lookbackDays = num(env.LOOKBACK_DAYS, 7);
  const lookbackStart = new Date(Date.now() - lookbackDays * 86400000);
  const startAt = env.BOARD_START_AT ? new Date(env.BOARD_START_AT) : null;
  // Show orders since the later of: go-live cutoff, or the lookback window.
  const since = startAt && !Number.isNaN(startAt.getTime()) && startAt > lookbackStart ? startAt : lookbackStart;

  return {
    source: (env.DATA_SOURCE === "live" ? "live" : "mock") as "live" | "mock",
    mode: (env.BOARD_MODE === "rehearsal" ? "rehearsal" : "live") as BoardMode,
    since,
    amberMin: num(env.AMBER_MIN, 15),
    redMin: num(env.RED_MIN, 30),
    alarmMin: num(env.ALARM_MIN, 60),
    undoMin: num(env.UNDO_MIN, 15),
    cacheSeconds: num(env.SHOPIFY_CACHE_SECONDS, 15),
    displayKey: env.DISPLAY_KEY ?? "",
    apiVersion: env.SHOPIFY_API_VERSION ?? "2026-10",
    stores: {
      supply: {
        domain: env.SUPPLY_SHOPIFY_DOMAIN ?? "vwzbpx-m4.myshopify.com",
        clientId: env.SUPPLY_SHOPIFY_CLIENT_ID ?? "",
        clientSecret: env.SUPPLY_SHOPIFY_CLIENT_SECRET ?? "",
      },
      garage: {
        domain: env.GARAGE_SHOPIFY_DOMAIN ?? "slowridegarage.myshopify.com",
        clientId: env.GARAGE_SHOPIFY_CLIENT_ID ?? "",
        clientSecret: env.GARAGE_SHOPIFY_CLIENT_SECRET ?? "",
      },
    },
    redis: {
      url: env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL ?? "",
      token: env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN ?? "",
    },
  };
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Screens send the key in the x-display-key header on every API call. It is never accepted
 * in the URL, so it stays out of server logs.
 *
 * With no DISPLAY_KEY set: open in local dev, CLOSED in any production build. A deployment
 * that is missing the variable (a preview, a new project) must not serve orders to anyone.
 */
export function authorized(req: Request): boolean {
  const key = config().displayKey;
  if (!key) return process.env.NODE_ENV !== "production";
  const sent = req.headers.get("x-display-key") ?? "";
  // Compare hashes in constant time, so the response time says nothing about the key.
  return timingSafeEqual(digest(sent), digest(key));
}
