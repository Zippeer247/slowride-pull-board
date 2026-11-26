// Mock source: orders shaped exactly like the live Admin GraphQL response.
//
// Orders are generated from the clock, not stored: every minute-slot deterministically
// does or doesn't hold an order. So every server instance and both screens see the same
// orders, new ones keep arriving, and nothing needs a database.
//
// It deliberately includes the messy real-world cases from the handoff doc:
// Syncio copies arriving late or never, app-pushed copies, pickups, reships,
// POS sales, cancelled and refunded orders, and rehearsal-tagged test orders.

import type { OrderSource, ShopifyLineItem, ShopifyOrder, StoreId } from "../types";
import { CATALOG, type CatalogProduct } from "./catalog";

const SLOT_MS = 60_000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];

function lineItems(r: () => number, products: CatalogProduct[], slot: number): ShopifyLineItem[] {
  const n = r() < 0.65 ? 1 : r() < 0.7 ? 2 : 3;
  const used = new Set<string>();
  const out: ShopifyLineItem[] = [];
  for (let i = 0; i < n; i++) {
    const p = pick(r, products);
    const v = pick(r, p.variants);
    if (used.has(v.sku)) continue;
    used.add(v.sku);
    out.push({
      id: `gid://shopify/LineItem/${slot}${i}`,
      title: p.title,
      variantTitle: v.title,
      sku: v.sku,
      quantity: r() < 0.88 ? 1 : 2,
      currentQuantity: 0, // set below
      isGiftCard: false,
      image: p.image ? { url: p.image } : null,
    });
  }
  for (const li of out) li.currentQuantity = li.quantity;
  return out;
}

interface Generated {
  garage: ShopifyOrder[];
  supply: ShopifyOrder[];
}

function slotOrders(slot: number, nowMs: number, perHour: number): Generated {
  const r = mulberry32(slot * 2654435761);
  const out: Generated = { garage: [], supply: [] };
  const createdMs = slot * SLOT_MS + Math.floor(r() * 50_000);
  const created = new Date(createdMs).toISOString();
  const num = String((slot % 90000) + 10000);
  const base = {
    cancelledAt: null,
    displayFinancialStatus: "PAID",
    app: null,
    shippingAddress: { city: pick(r, ["Phoenix", "Austin", "Fresno", "Denver", "Tulsa", "Reno", "Boise"]) },
    shippingLines: { nodes: [{ title: "Standard" }] },
  };

  // Background POS sales on Supply (must never show up).
  if (r() < 0.25) {
    out.supply.push({
      ...base,
      id: `gid://shopify/Order/9${slot}`,
      name: `#P${num}`,
      createdAt: created,
      sourceName: "pos",
      tags: [],
      shippingAddress: null,
      shippingLines: { nodes: [] },
      lineItems: { nodes: lineItems(r, CATALOG.supply, slot) },
    });
  }

  if (r() >= perHour / 60) return out;

  const tags: string[] = [];
  const roll = r();
  if (roll < 0.04) tags.push("rehearsal");
  const cancelled = r() < 0.03 ? created : null;
  const kind = r();

  if (kind < 0.55) {
    // slowride.com shipping order + (usually) its Syncio copy on Supply.
    const items = lineItems(r, CATALOG.garage, slot);
    const refunded = r() < 0.03;
    out.garage.push({
      ...base,
      id: `gid://shopify/Order/1${slot}`,
      name: `#${num}`,
      createdAt: created,
      cancelledAt: cancelled,
      displayFinancialStatus: refunded ? "REFUNDED" : "PAID",
      sourceName: "web",
      tags: [...tags],
      lineItems: { nodes: items },
    });
    // Syncio speed: median < 1 min, 90% within ~64 min, 99% within ~3 h, ~3% never.
    const s = r();
    const delayMin = s < 0.6 ? r() * 2 : s < 0.88 ? 2 + r() * 60 : s < 0.97 ? 60 + r() * 120 : Infinity;
    const appPushed = delayMin === Infinity && r() < 0.5; // Support app re-creates it after 3 h
    const copyAt = appPushed ? createdMs + 3 * 3600_000 : createdMs + delayMin * 60_000;
    if (Number.isFinite(copyAt) && copyAt <= nowMs) {
      out.supply.push({
        ...base,
        id: `gid://shopify/Order/2${slot}`,
        name: `#S${num}`,
        createdAt: new Date(copyAt).toISOString(),
        cancelledAt: cancelled,
        sourceName: appPushed ? "427322834945" : "1615469",
        app: appPushed ? null : { id: "gid://shopify/App/1615469", name: "Syncio" },
        tags: [...tags, "slowridegarage", `#${num}`, appPushed ? "Standard" : "Slow Ride", appPushed ? "app-pushed" : "Standard"],
        lineItems: { nodes: items.map((li) => ({ ...li, id: li.id + "s" })) },
      });
    }
  } else if (kind < 0.65) {
    // slowride.com in-store pickup: never reaches Supply.
    out.garage.push({
      ...base,
      id: `gid://shopify/Order/1${slot}`,
      name: `#${num}`,
      createdAt: created,
      cancelledAt: cancelled,
      sourceName: "web",
      tags: [...tags],
      shippingAddress: null,
      shippingLines: { nodes: [{ title: "11774 Hesperia Road" }] },
      lineItems: { nodes: lineItems(r, CATALOG.garage, slot) },
    });
  } else if (kind < 0.95) {
    // slowridesupply.com web order.
    out.supply.push({
      ...base,
      id: `gid://shopify/Order/3${slot}`,
      name: `#S${num}`,
      createdAt: created,
      cancelledAt: cancelled,
      sourceName: "web",
      tags: [...tags],
      lineItems: { nodes: lineItems(r, CATALOG.supply, slot) },
    });
  } else {
    // Replacement for an earlier slowride.com order.
    const ref = String(((slot - 40) % 90000) + 10000);
    out.supply.push({
      ...base,
      id: `gid://shopify/Order/4${slot}`,
      name: `#S${num}`,
      createdAt: created,
      cancelledAt: cancelled,
      displayFinancialStatus: "PAID",
      sourceName: "shopify_draft_order",
      tags: [...tags, "reship", `#${ref}`],
      lineItems: { nodes: lineItems(r, CATALOG.garage, slot).slice(0, 1) },
    });
  }
  return out;
}

export function mockOrders(nowMs: number, sinceMs: number, perHour: number, windowMin: number): Generated {
  const from = Math.max(sinceMs, nowMs - windowMin * 60_000);
  const out: Generated = { garage: [], supply: [] };
  for (let slot = Math.floor(from / SLOT_MS); slot * SLOT_MS <= nowMs; slot++) {
    const g = slotOrders(slot, nowMs, perHour);
    out.garage.push(...g.garage.filter((o) => Date.parse(o.createdAt) <= nowMs));
    out.supply.push(...g.supply.filter((o) => Date.parse(o.createdAt) <= nowMs));
  }
  const newest = (a: ShopifyOrder, b: ShopifyOrder) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
  out.garage.sort(newest);
  out.supply.sort(newest);
  return out;
}

export const mockSource: OrderSource = {
  async listOrders(store: StoreId, since: Date) {
    const perHour = Number(process.env.MOCK_ORDERS_PER_HOUR ?? 4);
    const windowMin = Number(process.env.MOCK_WINDOW_MIN ?? 120);
    return mockOrders(Date.now(), since.getTime(), perHour, windowMin)[store];
  },
};
