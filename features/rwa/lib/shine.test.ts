import { describe, expect, it, vi } from "vitest";

// The whole point of the exclusion below is the chain that has no pinned read
// client. Every chain the RWA desk lists happens to have one today, so the real
// registry cannot express the case this file exists to pin. The test client
// answers for Base alone, which makes Ethereum the non-receipt chain here.
vi.mock("@/lib/trade/receipt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/trade/receipt")>()),
  isReceiptChain: (chainId: number) => chainId === 8453,
}));

import { rwaExecutionIsConfirmed } from "@/features/rwa/lib/chains";
import { rwaEntryPrice, rwaShineEvent, rwaTradeId } from "@/features/rwa/lib/shine";

describe("which RWA chains Shine may post on", () => {
  it("confirms a chain with a pinned read client", () => {
    expect(rwaExecutionIsConfirmed("base")).toBe(true);
  });

  it("confirms Solana, whose signature status is polled", () => {
    expect(rwaExecutionIsConfirmed("solana")).toBe(true);
  });

  it("does not confirm an EVM chain with no pinned read client", () => {
    expect(rwaExecutionIsConfirmed("ethereum")).toBe(false);
  });

  it("does not confirm a chain the executor cannot even sign on", () => {
    expect(rwaExecutionIsConfirmed("linea" as never)).toBe(false);
  });
});

describe("the event an RWA trade warrants", () => {
  const base = {
    id: "ondo-base:action-1",
    symbol: "OUSG",
    price: rwaEntryPrice({ priceUsd: "109.42" }),
    stepCount: 1,
  } as const;

  it("reports a buy on a confirmed chain", () => {
    expect(rwaShineEvent({ ...base, chain: "base", side: "buy" })).toEqual({
      service: "rwa",
      kind: "buy",
      id: "ondo-base:action-1",
      symbol: "OUSG",
      price: "$109.42",
    });
  });

  it("reports a sale with no return, because the app holds no cost basis", () => {
    expect(rwaShineEvent({ ...base, chain: "base", side: "sell" })).toEqual({
      service: "rwa",
      kind: "sell",
      id: "ondo-base:action-1",
      symbol: "OUSG",
      price: "$109.42",
      pnl: null,
    });
  });

  it("reports nothing on a chain the app never waits for a confirmation on", () => {
    expect(rwaShineEvent({ ...base, chain: "ethereum", side: "buy" })).toBeNull();
  });

  it("reports nothing when the build carried no step to sign", () => {
    expect(rwaShineEvent({ ...base, chain: "base", side: "buy", stepCount: 0 })).toBeNull();
  });
});

describe("the price an RWA post states", () => {
  it("renders the catalogue price from its decimal string", () => {
    expect(rwaEntryPrice({ priceUsd: "109.42" })).toBe("$109.42");
  });

  it("falls back to the issuer's NAV price", () => {
    expect(rwaEntryPrice({ priceUsd: null, issuerData: { navPriceUsd: "0.9998" } })).toBe(
      "$0.9998"
    );
  });

  it("is null when the catalogue states no price", () => {
    expect(rwaEntryPrice({ priceUsd: null })).toBeNull();
  });
});

describe("the id an RWA trade is deduped by", () => {
  it("pairs the stable catalogue id with the built action", () => {
    expect(rwaTradeId("ondo-base", "action-1")).toBe("ondo-base:action-1");
  });
});
