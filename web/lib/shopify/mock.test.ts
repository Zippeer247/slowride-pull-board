import { describe, expect, it } from "vitest";
import { buildCards } from "../board";
import { mockOrders } from "./mock";

describe("mock source through the board", () => {
  const now = Date.parse("2026-11-25T23:00:00Z");
  const day = mockOrders(now, 0, 6, 24 * 60);
  const cards = buildCards(day.garage, day.supply, { mode: "live", since: new Date(0) });

  it("produces every kind of card", () => {
    expect(new Set(cards.map((c) => c.kind))).toEqual(new Set(["slowride", "pickup", "supply", "reship"]));
  });

  it("never shows a Garage order twice, even with its Syncio copy present", () => {
    const keys = cards.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(day.supply.some((o) => o.tags.includes("slowridegarage"))).toBe(true);
  });

  it("never shows POS sales or rehearsal orders in live mode", () => {
    expect(day.supply.some((o) => o.sourceName === "pos")).toBe(true);
    expect(cards.some((c) => c.number.startsWith("#P"))).toBe(false);
    expect(cards.some((c) => c.rehearsal)).toBe(false);
  });

  it("is deterministic, so both screens and all server instances agree", () => {
    expect(mockOrders(now, 0, 6, 24 * 60)).toEqual(day);
  });
});
