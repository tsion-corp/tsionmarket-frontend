import { describe, expect, it } from "vitest";
import {
  getSponsoredEvmChainByNetwork,
  hasGasPolicyForChainId,
  hasGasPolicyForNetwork,
} from "@/lib/trade/sponsored-evm";

// An Alchemy Gas Manager policy covers one network. The registry lists every
// chain that could be sponsored, which is a much longer list than the chains a
// policy actually exists for, and conflating the two is what rejects a userOp
// at the bundler as invalid fields.
describe("gas policy coverage", () => {
  it("covers the two networks we hold policies for", () => {
    expect(hasGasPolicyForNetwork("base-mainnet")).toBe(true);
    expect(hasGasPolicyForNetwork("polygon-mainnet")).toBe(true);
  });

  it("does not claim coverage for a registry chain with no policy", () => {
    expect(getSponsoredEvmChainByNetwork("hyperliquid-mainnet")).not.toBeNull();
    expect(hasGasPolicyForNetwork("hyperliquid-mainnet")).toBe(false);
    expect(hasGasPolicyForNetwork("eth-mainnet")).toBe(false);
  });

  it("answers by chain id too, for the send path", () => {
    expect(hasGasPolicyForChainId(8453)).toBe(true);
    expect(hasGasPolicyForChainId(999)).toBe(false);
  });

  it("is false for a chain that is not in the registry at all", () => {
    expect(hasGasPolicyForNetwork("solana-mainnet")).toBe(false);
    expect(hasGasPolicyForChainId(1234567)).toBe(false);
  });
});
