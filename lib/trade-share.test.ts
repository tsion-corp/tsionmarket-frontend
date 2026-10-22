import { describe, expect, it } from "vitest";
import { networkForChainId } from "@/lib/trade-share";

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
