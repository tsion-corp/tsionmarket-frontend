import { describe, expect, it } from "vitest";
import { nativeSymbol, networkLabel } from "@/lib/trade/networks";
import { NETWORK_TO_CHAIN } from "@/lib/sell";

describe("network metadata", () => {
  // The reported HYPE sell: the wallet held 0.021083 HYPE, which IS the gas
  // token, but the chain was missing from the symbol map so the gas check
  // matched nothing and the Sell button stayed disabled.
  it("names HyperEVM and its gas token", () => {
    expect(nativeSymbol("hyperliquid-mainnet")).toBe("HYPE");
    expect(networkLabel("hyperliquid-mainnet")).toBe("HyperEVM");
  });

  // Every chain a balance can be sold on must be nameable, or its holder gets
  // the same dead button. This is the assertion that keeps the two lists
  // together as chains are added.
  it("covers every sellable network", () => {
    const missing = Object.keys(NETWORK_TO_CHAIN).filter((n) => nativeSymbol(n) === null);
    expect(missing).toEqual([]);
  });

  it("falls back to the raw id rather than inventing a name", () => {
    expect(networkLabel("madeup-mainnet")).toBe("madeup-mainnet");
    expect(nativeSymbol("madeup-mainnet")).toBeNull();
  });
});
