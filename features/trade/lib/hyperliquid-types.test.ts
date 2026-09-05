import { describe, it, expect } from "vitest";
import { hlPairLabel } from "@/features/trade/lib/hyperliquid-types";

describe("hlPairLabel", () => {
  it("appends -USDC to a bare native symbol", () => {
    expect(hlPairLabel("BTC")).toBe("BTC-USDC");
  });

  it("strips the dex prefix from a HIP-3 symbol before appending -USDC", () => {
    expect(hlPairLabel("xyz:AAPL")).toBe("AAPL-USDC");
  });

  it("only strips up to the first colon, in case a symbol ever carries more than one", () => {
    expect(hlPairLabel("xyz:FOO:BAR")).toBe("FOO-USDC");
  });
});
