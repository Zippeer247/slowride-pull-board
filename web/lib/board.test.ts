import { describe, expect, it } from "vitest";
import { ageLevel, applyPulled, buildCards } from "./board";
import type { ShopifyOrder } from "./types";

const T0 = "2026-11-25T18:00:00Z";
const since = new Date("2026-11-25T00:00:00Z");

let seq = 1;
function order(p: Partial<ShopifyOrder> & { name: string }): ShopifyOrder {
  return {
    id: `gid://shopify/Order/${seq++}`,
    createdAt: T0,
    cancelledAt: null,
    displayFinancialStatus: "PAID",
    sourceName: "web",
    app: null,
    tags: [],
    shippingAddress: { city: "Phoenix" },
    shippingLines: { nodes: [{ title: "Standard" }] },
    lineItems: {
      nodes: [
        {
          id: "li1",
          title: "Slowride Joshua Tee",
          variantTitle: "Black / L",
          sku: "SR-JOSH-BLK-L",
          quantity: 1,
          currentQuantity: 1,
          isGiftCard: false,
          image: null,
        },
      ],
    },
    ...p,
  };
}

const live = { mode: "live" as const, since };

describe("buildCards", () => {
  it("shows a Garage shipping order before Syncio copies it", () => {
    const cards = buildCards([order({ name: "#5001" })], [], live);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ key: "g:5001", kind: "slowride", onSupply: false, number: "#5001" });
  });

  it("merges the Syncio copy into the Garage card (one card, not two)", () => {
    const copy = order({ name: "#S2001", tags: ["slowridegarage", "#5001", "Slow Ride", "Standard"], createdAt: "2026-11-25T18:01:00Z" });
    const cards = buildCards([order({ name: "#5001" })], [copy], live);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ key: "g:5001", onSupply: true });
  });

  it("merges an app-pushed copy the same way", () => {
    const copy = order({ name: "#S2002", tags: ["#5002", "slowridegarage", "Standard", "app-pushed"] });
    const cards = buildCards([order({ name: "#5002" })], [copy], live);
    expect(cards).toHaveLength(1);
    expect(cards[0].onSupply).toBe(true);
  });

  it("falls back to the Supply copy when Garage did not return the order", () => {
    const copy = order({ name: "#S2003", tags: ["slowridegarage", "#5003"] });
    const cards = buildCards([], [copy], live);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ key: "g:5003", number: "#5003", kind: "slowride", onSupply: true });
  });

  it("hides the Supply copy when the Garage order was refunded", () => {
    const g = order({ name: "#5004", displayFinancialStatus: "REFUNDED" });
    const copy = order({ name: "#S2004", tags: ["slowridegarage", "#5004"] });
    expect(buildCards([g], [copy], live)).toHaveLength(0);
  });

  it("detects Garage in-store pickups", () => {
    const p = order({ name: "#5005", shippingAddress: null, shippingLines: { nodes: [{ title: "11774 Hesperia Road" }] } });
    const cards = buildCards([p], [], live);
    expect(cards[0]).toMatchObject({ kind: "pickup", onSupply: null });
  });

  it("does not treat an order with an address as a pickup", () => {
    const p = order({ name: "#5006", shippingLines: { nodes: [{ title: "11774 Hesperia Road" }] } });
    expect(buildCards([p], [], live)[0].kind).toBe("slowride");
  });

  it("includes Supply web orders and excludes POS sales", () => {
    const web = order({ name: "#S3001" });
    const pos = order({ name: "#S3002", sourceName: "pos" });
    const cards = buildCards([], [web, pos], live);
    expect(cards.map((c) => c.number)).toEqual(["#S3001"]);
    expect(cards[0].kind).toBe("supply");
  });

  it("shows reships as their own card with a note", () => {
    const r = order({ name: "#S3003", tags: ["reship", "#5001"] });
    const cards = buildCards([order({ name: "#5001" })], [r], live);
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.kind === "reship")?.note).toBe("Replacement for slowride.com #5001");
  });

  it("drops cancelled orders on either store", () => {
    const g = order({ name: "#5007", cancelledAt: T0 });
    const s = order({ name: "#S3004", cancelledAt: T0 });
    expect(buildCards([g], [s], live)).toHaveLength(0);
  });

  it("hides rehearsal/training orders in live mode and shows only them in rehearsal mode", () => {
    const real = order({ name: "#5008" });
    const fake = order({ name: "#5009", tags: ["rehearsal"] });
    const train = order({ name: "#S3005", tags: ["Training"] });
    expect(buildCards([real, fake], [train], live).map((c) => c.number)).toEqual(["#5008"]);
    const reh = buildCards([real, fake], [train], { mode: "rehearsal", since });
    expect(reh.map((c) => c.number).sort()).toEqual(["#5009", "#S3005"]);
  });

  it("ignores orders before the go-live cutoff", () => {
    const old = order({ name: "#5010", createdAt: "2026-11-24T23:59:00Z" });
    expect(buildCards([old], [], live)).toHaveLength(0);
  });

  it("drops removed lines and gift cards, and cards with nothing left to pull", () => {
    const o = order({
      name: "#5011",
      lineItems: {
        nodes: [
          { id: "a", title: "Removed", variantTitle: null, sku: "X", quantity: 1, currentQuantity: 0, isGiftCard: false, image: null },
          { id: "b", title: "Gift Card", variantTitle: "$50", sku: null, quantity: 1, currentQuantity: 1, isGiftCard: true, image: null },
        ],
      },
    });
    expect(buildCards([o], [], live)).toHaveLength(0);
  });

  it("hides 'Default Title' variants and sorts oldest first", () => {
    const a = order({ name: "#5012", createdAt: "2026-11-25T18:10:00Z" });
    const b = order({ name: "#S3006", createdAt: "2026-11-25T18:05:00Z" });
    b.lineItems.nodes[0] = { ...b.lineItems.nodes[0], variantTitle: "Default Title" };
    const cards = buildCards([a], [b], live);
    expect(cards.map((c) => c.number)).toEqual(["#S3006", "#5012"]);
    expect(cards[0].items[0].variant).toBeNull();
  });
});

describe("ageLevel", () => {
  const now = new Date("2026-11-25T18:40:00Z");
  it("colors by minutes waiting", () => {
    expect(ageLevel("2026-11-25T18:39:00Z", now, 15, 30)).toBe("new");
    expect(ageLevel("2026-11-25T18:30:00Z", now, 15, 30)).toBe("ok");
    expect(ageLevel("2026-11-25T18:25:00Z", now, 15, 30)).toBe("amber");
    expect(ageLevel("2026-11-25T18:10:00Z", now, 15, 30)).toBe("red");
  });
});

describe("applyPulled", () => {
  it("moves pulled cards to the undo strip, then drops them after the window", () => {
    const now = new Date("2026-11-25T18:30:00Z");
    const cards = buildCards([order({ name: "#6001" }), order({ name: "#6002" }), order({ name: "#6003" })], [], live);
    const res = applyPulled(
      cards,
      { "g:6001": { at: "2026-11-25T18:25:00Z", screen: "front" }, "g:6002": { at: "2026-11-25T18:00:00Z", screen: "back" } },
      now,
      15,
    );
    expect(res.toPull.map((c) => c.key)).toEqual(["g:6003"]);
    expect(res.justPulled.map((c) => c.key)).toEqual(["g:6001"]);
  });
});
