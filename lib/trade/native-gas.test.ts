import { describe, expect, it, vi } from "vitest";

const getGasPrice = vi.hoisted(() => vi.fn());
vi.mock("@/lib/trade/receipt", () => ({
  isReceiptChain: (id: number) => id === 999,
  publicClientForChain: () => ({ getGasPrice }),
}));

import { nativeSendCost } from "@/lib/trade/native-gas";

describe("nativeSendCost", () => {
  // 21000 gas at 1 gwei is 0.000021 native, and the reserve carries half again
  // because the price can rise between this read and inclusion.
  it("prices a transfer from the live gas price, with headroom", async () => {
    getGasPrice.mockResolvedValue(1_000_000_000n);
    expect(await nativeSendCost("hyperliquid-mainnet")).toBeCloseTo(0.0000315, 10);
  });

  // The whole point: measured, this is cents rather than the dollars a
  // percentage of an eighty-dollar token would have reserved.
  it("stays far under the sized fallback on a cheap chain", async () => {
    getGasPrice.mockResolvedValue(100_000_000n);
    expect(await nativeSendCost("hyperliquid-mainnet")).toBeLessThan(0.001);
  });

  it("refuses a chain with no read node rather than guessing", async () => {
    await expect(nativeSendCost("madeup-mainnet")).rejects.toThrow(/read node/);
  });
});
