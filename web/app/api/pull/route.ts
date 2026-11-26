// POST { key, screen, undo? } : mark an order pulled (or undo). Writes only to our own Redis,
// never to Shopify.
import { authorized, config } from "@/lib/config";
import { currentCards } from "@/lib/service";
import { pulledStore } from "@/lib/state";

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { key?: string; screen?: string; undo?: boolean } | null;
  const key = body?.key;
  if (!key || typeof key !== "string" || key.length > 120) return Response.json({ error: "bad key" }, { status: 400 });
  const screen = String(body?.screen ?? "unknown").slice(0, 20);
  const store = pulledStore();

  if (body?.undo) {
    const p = (await store.all())[key];
    if (p && Date.now() - Date.parse(p.at) > config().undoMin * 60000) {
      return Response.json({ error: "too late to undo" }, { status: 409 });
    }
    await store.undo(key);
    return Response.json({ ok: true });
  }

  // Only accept keys of orders that are actually on the board.
  const { cards } = await currentCards();
  if (!cards.some((c) => c.key === key)) return Response.json({ error: "unknown order" }, { status: 404 });
  await store.mark(key, { at: new Date().toISOString(), screen });
  return Response.json({ ok: true });
}
