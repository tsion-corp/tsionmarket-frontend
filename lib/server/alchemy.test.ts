import { describe, expect, it } from "vitest";
import {
  EVM_NETWORKS,
  NATIVE_PRICE_SYMBOLS,
  PRICE_SYMBOLS_PER_REQUEST,
  isAllowedHolding,
} from "@/lib/server/alchemy";
import { CONTRACTS } from "@/lib/polymarket/config";

const emptyRwa = {};
const emptyBuyable = {};

describe("isAllowedHolding, newly added chains", () => {
  it("allows native BNB on bnb-mainnet, the chain the holdings bug was reported on", () => {
    expect(isAllowedHolding("bnb-mainnet", null, true, emptyRwa, emptyBuyable)).toBe(true);
  });

  it("allows every network's native gas token, since EVM_NETWORKS and NATIVE_TOKEN must stay in sync", () => {
    for (const network of EVM_NETWORKS) {
      if (network === "mythos-mainnet") continue; // no verified native-token data, see alchemy.ts
      expect(isAllowedHolding(network, null, true, emptyRwa, emptyBuyable)).toBe(true);
    }
  });

  it("still rejects a native balance on a chain we don't track", () => {
    expect(isAllowedHolding("fantom-mainnet", null, true, emptyRwa, emptyBuyable)).toBe(false);
  });

  it("mythos-mainnet has no verified native-token data, so its native balance stays out", () => {
    expect(isAllowedHolding("mythos-mainnet", null, true, emptyRwa, emptyBuyable)).toBe(false);
  });

  it("recognizes a token bought on a new chain via the buyable registry, same as the original chains", () => {
    const buyable = { "bnb-mainnet": new Set(["0x1234567890123456789012345678901234567890"]) };
    expect(
      isAllowedHolding(
        "bnb-mainnet",
        "0x1234567890123456789012345678901234567890",
        false,
        emptyRwa,
        buyable
      )
    ).toBe(true);
  });

  it("still rejects an unrecognized token on a new chain (no allowlist bypass)", () => {
    expect(
      isAllowedHolding(
        "bnb-mainnet",
        "0x0000000000000000000000000000000000dead",
        false,
        emptyRwa,
        emptyBuyable
      )
    ).toBe(false);
  });

  it("keeps Polygon pUSD visible even when it is not in the buyable catalog", () => {
    expect(isAllowedHolding("polygon-mainnet", CONTRACTS.pusd, false, emptyRwa, emptyBuyable)).toBe(
      true
    );
  });
});

// Two users had a buy delivered on a chain the portfolio reads (APE on
// ApeChain, HYPE on HyperEVM) and saw nothing in holdings. The allowlist was
// not the problem — these assert the layer that was: the Portfolio API returns
// no price for those natives, so the by-symbol backfill has to cover every
// chain we track, or the holding is valued at $0 and hidden by default.
describe("NATIVE_PRICE_SYMBOLS", () => {
  it("covers the native symbol of every chain we resolve a native balance on", () => {
    for (const symbol of ["ETH", "POL", "SOL", "APE", "HYPE", "BNB", "BERA", "CELO", "AVAX"]) {
      expect(NATIVE_PRICE_SYMBOLS).toContain(symbol);
    }
  });

  it("stays inside the price endpoint's 25-symbol per-request cap", () => {
    expect(NATIVE_PRICE_SYMBOLS.length).toBeLessThanOrEqual(PRICE_SYMBOLS_PER_REQUEST);
  });

  it("carries no duplicates, so the cache key is stable", () => {
    expect(new Set(NATIVE_PRICE_SYMBOLS).size).toBe(NATIVE_PRICE_SYMBOLS.length);
  });
});
