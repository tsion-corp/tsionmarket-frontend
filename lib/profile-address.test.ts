import { describe, expect, it } from "vitest";
import { findStaticAddress, profileAddressSpec, type StaticAddress } from "@/lib/deposit";

const EVM = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const SOL = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";

function addr(over: Partial<StaticAddress>): StaticAddress {
  return {
    id: "1",
    depositAddress: "0xdead",
    originChainId: 8453,
    originAsset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    settlementChainId: 8453,
    settlementAsset: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    settlementAddress: EVM,
    userId: "u1",
    createdAt: "2026-08-01T00:00:00Z",
    ...over,
  };
}

describe("profileAddressSpec", () => {
  it("settles a family's USDC into that family's own wallet", () => {
    const spec = profileAddressSpec("u1", "solana", SOL)!;
    expect(spec.request.originChainId).toBe(spec.request.settlementChainId);
    expect(spec.request.settlementAddress).toBe(SOL);
    // Dextopus rejects a refund address from a different VM family.
    expect(spec.request.refundTo).toBe(SOL);
  });

  it("declines a family whose wallet is not ready", () => {
    // Minting against a missing settlement address would bind the address to
    // the wrong destination permanently — a static address cannot be repointed.
    expect(profileAddressSpec("u1", "ethereum", null)).toBeNull();
  });
});

describe("findStaticAddress", () => {
  const spec = profileAddressSpec("u1", "ethereum", EVM)!;

  it("reuses the oldest match so a saved address stays valid", () => {
    // Minting is not idempotent: duplicates accumulate for the same request.
    const found = findStaticAddress(
      [
        addr({ depositAddress: "0xnewer", createdAt: "2026-08-03T00:00:00Z" }),
        addr({ depositAddress: "0xoldest", createdAt: "2026-08-01T00:00:00Z" }),
      ],
      spec.request
    );
    expect(found?.depositAddress).toBe("0xoldest");
  });

  it("matches addresses case-insensitively", () => {
    const found = findStaticAddress([addr({ settlementAddress: EVM.toLowerCase() })], spec.request);
    expect(found).not.toBeNull();
  });

  it("never reuses an address bound to a different origin asset", () => {
    // The QA failure: SOL sent to a USDC-origin address is not detected.
    const solSpec = profileAddressSpec("u1", "solana", SOL)!;
    const nativeSol = addr({
      originChainId: 792703809,
      originAsset: "11111111111111111111111111111111",
      settlementChainId: 792703809,
      settlementAsset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      settlementAddress: SOL,
    });
    expect(findStaticAddress([nativeSol], solSpec.request)).toBeNull();
  });

  it("returns null when the user has no address yet", () => {
    expect(findStaticAddress([], spec.request)).toBeNull();
  });
});
