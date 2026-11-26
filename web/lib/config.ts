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

/** Screens send the key as ?key= on the page and x-display-key on API calls. Open when unset (local dev). */
export function authorized(req: Request): boolean {
  const key = config().displayKey;
  if (!key) return true;
  const url = new URL(req.url);
  return req.headers.get("x-display-key") === key || url.searchParams.get("key") === key;
}
