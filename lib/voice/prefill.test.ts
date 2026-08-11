import { describe, expect, it } from "vitest";
import {
  depositToQuery,
  prefillToQuery,
  readDepositPrefill,
  readTradePrefill,
} from "@/lib/voice/prefill";
import type { DepositPrefill, TradePrefill } from "@/lib/voice/intent";

// The URL round-trip that carries a spoken buy/sell to the target section.
describe("trade prefill query", () => {
  it("round-trips a buy with amount", () => {
    const prefill: TradePrefill = { symbol: "USDY", amount: "10", mode: "buy" };
    const back = readTradePrefill(new URLSearchParams(prefillToQuery(prefill)));
    expect(back).toEqual(prefill);
  });

  it("round-trips a sell without amount", () => {
    const prefill: TradePrefill = { symbol: "TSLAx", mode: "sell" };
    const back = readTradePrefill(new URLSearchParams(prefillToQuery(prefill)));
    expect(back).toEqual(prefill);
  });

  it("returns null when no prefill params are present", () => {
    expect(readTradePrefill(new URLSearchParams("foo=bar"))).toBeNull();
  });

  it("returns null for an invalid mode", () => {
    expect(readTradePrefill(new URLSearchParams("trade=USDY&mode=swap"))).toBeNull();
  });

  it("drops a non-numeric amount but keeps the trade", () => {
    const back = readTradePrefill(new URLSearchParams("trade=USDY&mode=buy&amount=lots"));
    expect(back).toEqual({ symbol: "USDY", mode: "buy" });
  });
});

describe("deposit prefill query", () => {
  it("round-trips a deposit with chain + token", () => {
    const prefill: DepositPrefill = { chain: "solana", token: "USDC" };
    const back = readDepositPrefill(new URLSearchParams(depositToQuery(prefill)));
    expect(back).toEqual(prefill);
  });

  it("round-trips a chain-only deposit", () => {
    const prefill: DepositPrefill = { chain: "base" };
    const back = readDepositPrefill(new URLSearchParams(depositToQuery(prefill)));
    expect(back).toEqual(prefill);
  });

  it("returns null when funds param is not crypto", () => {
    expect(readDepositPrefill(new URLSearchParams("depositChain=solana"))).toBeNull();
  });

  it("round-trips any chain name (free text — not a fixed set)", () => {
    const prefill: DepositPrefill = { chain: "arbitrum", token: "USDT" };
    const back = readDepositPrefill(new URLSearchParams(depositToQuery(prefill)));
    expect(back).toEqual(prefill);
  });
});
