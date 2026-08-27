import { describe, expect, it } from "vitest";
import { networkForChainId, tradeShareRef } from "@/lib/trade-share";

const EVM_HASH = `0x${"a".repeat(64)}`;

describe("networkForChainId", () => {
  it("inverts the same table the sell flow uses", () => {
    expect(networkForChainId(8453)).toBe("base-mainnet");
    expect(networkForChainId(1)).toBe("eth-mainnet");
    expect(networkForChainId(42161)).toBe("arb-mainnet");
  });

  it("returns null for a chain we do not settle on", () => {
    expect(networkForChainId(999999)).toBeNull();
  });
});

describe("tradeShareRef", () => {
  it("builds the same shape the activity rows use", () => {
    expect(tradeShareRef(8453, EVM_HASH)).toBe(`base-mainnet:${EVM_HASH}`);
  });

  it("accepts a Solana signature", () => {
    const signature = "5".repeat(80);
    expect(tradeShareRef(792703809, signature)).toBe(`solana-mainnet:${signature}`);
  });

  // A share control that produces a dead link is worse than no share control:
  // the person believes they posted something openable.
  it("withholds a link rather than building a dead one", () => {
    expect(tradeShareRef(null, EVM_HASH)).toBeNull();
    expect(tradeShareRef(8453, null)).toBeNull();
    expect(tradeShareRef(8453, "")).toBeNull();
    expect(tradeShareRef(999999, EVM_HASH)).toBeNull();
    expect(tradeShareRef(8453, "not-a-hash")).toBeNull();
    expect(tradeShareRef(8453, "0x123")).toBeNull();
  });

  it("trims surrounding whitespace rather than rejecting on it", () => {
    expect(tradeShareRef(8453, `  ${EVM_HASH}  `)).toBe(`base-mainnet:${EVM_HASH}`);
  });
});
