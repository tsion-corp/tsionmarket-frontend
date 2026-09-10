import { describe, expect, it } from "vitest";
import type { RwaBriefRow } from "@/lib/dashboard-feed";
import { formatApy, groupRwaSpots } from "./real-assets";

const row = (over: Partial<RwaBriefRow> = {}): RwaBriefRow => ({
  id: "ethereum:0x1",
  symbol: "PAXG",
  name: "Paxos Gold",
  issuer: "Paxos",
  category: "commodity",
  apyBps: null,
  logo: "/api/token-logos/ethereum/0x1",
  priceUsd: 2412.5,
  change24h: 0.264,
  ...over,
});

describe("groupRwaSpots", () => {
  it("formats every figure, so the cards never see a number", () => {
    const { gold } = groupRwaSpots([row()]);
    expect(gold[0]).toMatchObject({
      symbol: "PAXG",
      issuer: "Paxos",
      price: "$2,412.50",
      change: "+0.26%",
      up: true,
      apy: null,
      href: "/rwa",
    });
  });

  it("leaves a missing price or move as null rather than a zero", () => {
    const { gold } = groupRwaSpots([row({ priceUsd: null, change24h: null })]);
    expect(gold[0].price).toBeNull();
    expect(gold[0].change).toBeNull();
  });

  it("groups funds and cash equivalents with treasuries, led by the highest yield", () => {
    const { treasuries } = groupRwaSpots([
      row({ id: "a", symbol: "USDY", category: "treasury", apyBps: 360 }),
      row({ id: "b", symbol: "BUIDL", category: "fund", apyBps: null }),
      row({ id: "c", symbol: "USTB", category: "treasury", apyBps: 376 }),
      row({ id: "d", symbol: "USDon", category: "cash-equivalent", apyBps: null }),
    ]);
    expect(treasuries.map((s) => s.symbol)).toEqual(["USTB", "USDY", "BUIDL", "USDon"]);
    expect(treasuries[0].apy).toBe("3.76%");
  });

  it("leads gold and real estate with the assets that carry a live price", () => {
    const { realEstate } = groupRwaSpots([
      row({ id: "a", symbol: "LAND", category: "real-estate", priceUsd: null }),
      row({ id: "b", symbol: "PRO", category: "real-estate", priceUsd: 0.37 }),
    ]);
    expect(realEstate.map((s) => s.symbol)).toEqual(["PRO", "LAND"]);
  });

  it("keeps the registry's order for stocks, which the card rotates through", () => {
    const { stocks } = groupRwaSpots([
      row({ id: "a", symbol: "TSLAx", category: "equity" }),
      row({ id: "b", symbol: "NVDAx", category: "equity" }),
    ]);
    expect(stocks.map((s) => s.symbol)).toEqual(["TSLAx", "NVDAx"]);
  });

  it("ignores categories no card shows", () => {
    const grouped = groupRwaSpots([row({ category: "carbon" }), row({ id: "z", category: null })]);
    expect(Object.values(grouped).every((list) => list.length === 0)).toBe(true);
  });
});

describe("formatApy", () => {
  it("prints basis points as a percentage, and nothing for none", () => {
    expect(formatApy(376)).toBe("3.76%");
    expect(formatApy(0)).toBeNull();
    expect(formatApy(null)).toBeNull();
  });
});
