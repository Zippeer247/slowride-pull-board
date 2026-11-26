// POST { key, screen, undo? } : mark an order pulled (or undo). Writes only to our own Redis,
// never to Shopify.
import { authorized, config } from "@/lib/config";
import { currentCards } from "@/lib/service";
import { pulledStore } from "@/lib/state";

const MAX_BODY = 2000;
// Card keys are `g:<order number>` or `s:<Shopify order gid>` (see lib/board.ts).
const CARD_KEY = /^[gs]:[\w:/.#-]{1,110}$/;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);

  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY) return json({ error: "too large" }, 413);
  let body: { key?: unknown; screen?: unknown; undo?: unknown } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {}
  const key = body?.key;
  if (typeof key !== "string" || !CARD_KEY.test(key)) return json({ error: "bad key" }, 400);
  const screen = (typeof body?.screen === "string" ? body.screen : "unknown").replace(/[^\w-]/g, "").slice(0, 20) || "unknown";

  try {
    const store = pulledStore();

    if (body?.undo === true) {
      const all = await store.all();
      const p = Object.hasOwn(all, key) ? all[key] : undefined;
      if (!p) return json({ ok: true }); // nothing to undo
      if (Date.now() - Date.parse(p.at) > config().undoMin * 60000) return json({ error: "too late to undo" }, 409);
      await store.undo(key);
      return json({ ok: true });
    }

    // Only accept keys of orders that are actually on the board.
    const { cards } = await currentCards();
    if (!cards.some((c) => c.key === key)) return json({ error: "unknown order" }, 404);
    await store.mark(key, { at: new Date().toISOString(), screen });
    return json({ ok: true });
  } catch (e) {
    console.error("pull failed", e);
    return json({ error: "server error" }, 500);
  }
}
