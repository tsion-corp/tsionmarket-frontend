import { describe, expect, it } from "vitest";
import {
  getSponsoredEvmChainByNetwork,
  hasGasPolicyForChainId,
  hasGasPolicyForNetwork,
  SPONSORED_EVM_CHAINS,
} from "@/lib/trade/sponsored-evm";

// The team's Gas Manager policy is one paymaster policy enabled on every
// mainnet the API key can reach, probed network by network on 2026-09-07
// (ADR-2026-09-07-sponsor-all-evm-mainnets). The flag therefore covers every
// mainnet the app can also read, and nothing else: testnets carry no policy,
// and a chain the key cannot reach or the app cannot read would turn a working
// user-paid send into a failing sponsored one.
const SPONSORED_MAINNETS = [
  "eth-mainnet",
  "base-mainnet",
  "arb-mainnet",
  "apechain-mainnet",
  "berachain-mainnet",
  "bnb-mainnet",
  "celo-mainnet",
  "cronos-mainnet",
  "frax-mainnet",
  "gensyn-mainnet",
  "hyperliquid-mainnet",
  "ink-mainnet",
  "monad-mainnet",
  "opbnb-mainnet",
  "opt-mainnet",
  "plasma-mainnet",
  "polygon-mainnet",
  "robinhood-mainnet",
  "shape-mainnet",
  "soneium-mainnet",
  "stable-mainnet",
  "unichain-mainnet",
  "worldchain-mainnet",
] as const;

describe("gas policy coverage", () => {
  it.each(SPONSORED_MAINNETS)("covers %s", (network) => {
    expect(hasGasPolicyForNetwork(network)).toBe(true);
  });

  it("covers exactly the probed mainnets and no other registry chain", () => {
    const flagged = SPONSORED_EVM_CHAINS.filter((c) => c.gasPolicy)
      .map((c) => c.network)
      .sort();
    expect(flagged).toEqual([...SPONSORED_MAINNETS].sort());
  });

  it("leaves testnets and unreachable mainnets on the user-paid path", () => {
    for (const network of [
      "eth-sepolia",
      "base-sepolia",
      "polygon-amoy",
      // The API key has no access to these two.
      "arbnova-mainnet",
      "polynomial-mainnet",
      // No viem chain, so no read client: the send path would refuse it.
      "edge-mainnet",
    ]) {
      expect(getSponsoredEvmChainByNetwork(network), network).not.toBeNull();
      expect(hasGasPolicyForNetwork(network), network).toBe(false);
    }
  });

  it("answers by chain id too, for the send path", () => {
    expect(hasGasPolicyForChainId(8453)).toBe(true);
    expect(hasGasPolicyForChainId(42161)).toBe(true);
    expect(hasGasPolicyForChainId(999)).toBe(true);
    expect(hasGasPolicyForChainId(11155111)).toBe(false);
  });

  it("is false for a chain that is not in the registry at all", () => {
    expect(hasGasPolicyForNetwork("solana-mainnet")).toBe(false);
    expect(hasGasPolicyForChainId(1234567)).toBe(false);
  });
});

describe("sponsorship mode per network", () => {
  // The policy is a paymaster-type policy; the bundler header path answers
  // "does not support bundler sponsorship" for it on every network. See
  // ADR-2026-09-06-base-sponsorship-via-paymaster.
  it("runs every sponsored chain through the paymaster path", () => {
    for (const config of SPONSORED_EVM_CHAINS) {
      if (!config.gasPolicy) continue;
      expect(config.sponsorshipMode, config.network).toBe("paymaster");
    }
  });

  it("only sponsors chains it can also read receipts from", () => {
    // sendSponsoredEvmCalls refuses a chain without a read client, so a
    // flagged chain without one would fail every sell instead of falling back.
    for (const config of SPONSORED_EVM_CHAINS) {
      if (!config.gasPolicy) continue;
      expect(config.supportsReceiptPolling, config.network).toBe(true);
    }
  });
});
