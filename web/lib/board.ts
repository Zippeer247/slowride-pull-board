// Pure board logic: which orders go on the screen, merged and deduped.
// No I/O here, so it is fully covered by lib/board.test.ts.

import type { Card, CardItem, PulledInfo, ShopifyOrder } from "./types";

export type BoardMode = "live" | "rehearsal";

/** Garage's in-store pickup shows up as this shipping line, with no shipping address. */
export const PICKUP_LINE = "11774 hesperia road";

const DEAD_FINANCIAL = new Set(["REFUNDED", "VOIDED", "EXPIRED"]);

const lower = (tags: string[]) => tags.map((t) => t.trim().toLowerCase());

export function isRehearsal(o: ShopifyOrder): boolean {
  const t = lower(o.tags);
  return t.includes("rehearsal") || t.includes("training");
}

export function isPos(o: ShopifyOrder): boolean {
  return (o.sourceName ?? "").toLowerCase() === "pos";
}

export function isPickup(o: ShopifyOrder): boolean {
  if (o.shippingAddress) return false;
  return o.shippingLines.nodes.some((l) => l.title.trim().toLowerCase().includes(PICKUP_LINE));
}

/** "#1234" -> "1234" */
export function orderNumber(name: string): string {
  return name.replace(/^#/, "").trim();
}

/** Supply copies carry the Garage number as a "#1234" tag. */
export function garageNumberFromTags(tags: string[]): string | null {
  for (const t of tags) {
    const m = t.trim().match(/^#(\d+)$/);
    if (m) return m[1];
  }
  return null;
}

export function isGarageCopy(o: ShopifyOrder): boolean {
  return lower(o.tags).includes("slowridegarage");
}

export function isReship(o: ShopifyOrder): boolean {
  return lower(o.tags).includes("reship");
}

function items(o: ShopifyOrder): CardItem[] {
  return o.lineItems.nodes
    .filter((li) => li.currentQuantity > 0 && !li.isGiftCard)
    .map((li) => ({
      title: li.title,
      variant: li.variantTitle && li.variantTitle !== "Default Title" ? li.variantTitle : null,
      sku: li.sku || null,
      qty: li.currentQuantity,
      image: li.image?.url ?? null,
    }));
}

function passesMode(o: ShopifyOrder, mode: BoardMode): boolean {
  return mode === "rehearsal" ? isRehearsal(o) : !isRehearsal(o);
}

export interface BuildOptions {
  mode: BoardMode;
  since: Date;
}

/**
 * Turn raw orders from both stores into one list of cards, oldest first.
 *
 * - A Garage order and its Supply copy (Syncio or app-pushed) become ONE card keyed
 *   `g:<garage number>`, whichever arrives first. The key never changes, so a pull
 *   recorded before the copy lands still counts after.
 * - If Garage returned the order (any status), Garage decides: a refunded or cancelled
 *   Garage order hides its Supply copy too.
 * - If Garage didn't return it (fetch failed, or older than the window), the Supply copy
 *   is shown on its own as a backup.
 */
export function buildCards(garage: ShopifyOrder[], supply: ShopifyOrder[], opts: BuildOptions): Card[] {
  const sinceMs = opts.since.getTime();
  const inWindow = (o: ShopifyOrder) => Date.parse(o.createdAt) >= sinceMs;

  const cards = new Map<string, Card>();
  const garageSeen = new Set<string>();

  for (const o of garage) {
    const num = orderNumber(o.name);
    garageSeen.add(num);
    if (o.cancelledAt || isPos(o) || !inWindow(o) || !passesMode(o, opts.mode)) continue;
    if (DEAD_FINANCIAL.has((o.displayFinancialStatus ?? "").toUpperCase())) continue;
    const its = items(o);
    if (its.length === 0) continue;
    const pickup = isPickup(o);
    cards.set(`g:${num}`, {
      key: `g:${num}`,
      number: `#${num}`,
      kind: pickup ? "pickup" : "slowride",
      createdAt: o.createdAt,
      items: its,
      note: null,
      onSupply: pickup ? null : false,
      rehearsal: isRehearsal(o),
    });
  }

  for (const o of supply) {
    if (o.cancelledAt || isPos(o) || !inWindow(o) || !passesMode(o, opts.mode)) continue;
    const ref = garageNumberFromTags(o.tags);

    if (isReship(o)) {
      const its = items(o);
      if (its.length === 0) continue;
      const key = `s:${o.id}`;
      cards.set(key, {
        key,
        number: o.name,
        kind: "reship",
        createdAt: o.createdAt,
        items: its,
        note: ref ? `Replacement for slowride.com #${ref}` : "Replacement order",
        onSupply: null,
        rehearsal: isRehearsal(o),
      });
      continue;
    }

    if (isGarageCopy(o) && ref) {
      const key = `g:${ref}`;
      const existing = cards.get(key);
      if (existing) {
        existing.onSupply = true;
        continue;
      }
      if (garageSeen.has(ref)) continue; // Garage said no (refunded / cancelled / test)
      const its = items(o);
      if (its.length === 0) continue;
      cards.set(key, {
        key,
        number: `#${ref}`,
        kind: "slowride",
        createdAt: o.createdAt,
        items: its,
        note: null,
        onSupply: true,
        rehearsal: isRehearsal(o),
      });
      continue;
    }

    const its = items(o);
    if (its.length === 0) continue;
    const key = `s:${o.id}`;
    cards.set(key, {
      key,
      number: o.name,
      kind: "supply",
      createdAt: o.createdAt,
      items: its,
      note: null,
      onSupply: null,
      rehearsal: isRehearsal(o),
    });
  }

  return [...cards.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export type AgeLevel = "new" | "ok" | "amber" | "red";

export function ageLevel(createdAt: string, now: Date, amberMin: number, redMin: number): AgeLevel {
  const min = (now.getTime() - Date.parse(createdAt)) / 60000;
  if (min >= redMin) return "red";
  if (min >= amberMin) return "amber";
  if (min < 2) return "new";
  return "ok";
}

/** Split cards into still-to-pull and recently pulled (undo window). Older pulls drop off. */
export function applyPulled(
  cards: Card[],
  pulled: Record<string, PulledInfo>,
  now: Date,
  undoMin: number,
): { toPull: Card[]; justPulled: (Card & { pulled: PulledInfo })[] } {
  const toPull: Card[] = [];
  const justPulled: (Card & { pulled: PulledInfo })[] = [];
  for (const c of cards) {
    const p = pulled[c.key];
    if (!p) toPull.push(c);
    else if (now.getTime() - Date.parse(p.at) <= undoMin * 60000) justPulled.push({ ...c, pulled: p });
  }
  justPulled.sort((a, b) => Date.parse(b.pulled.at) - Date.parse(a.pulled.at));
  return { toPull, justPulled };
}
