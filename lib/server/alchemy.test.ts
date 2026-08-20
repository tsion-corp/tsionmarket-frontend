import { describe, expect, it } from "vitest";
import { EVM_NETWORKS, isAllowedHolding } from "@/lib/server/alchemy";

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
});
