import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGasPrice, estimateGas } = vi.hoisted(() => ({
  getGasPrice: vi.fn(),
  estimateGas: vi.fn(),
}));
vi.mock("@/lib/trade/receipt", () => ({
  isReceiptChain: (id: number) => id === 999 || id === 33139,
  publicClientForChain: () => ({ getGasPrice, estimateGas }),
}));

import { nativeSendCost } from "@/lib/trade/native-gas";

describe("nativeSendCost", () => {
  beforeEach(() => {
    estimateGas.mockReset();
    estimateGas.mockResolvedValue(21_000n);
  });

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

  // "gas required exceeds allowance (15749)" selling APE on ApeChain,
  // 2026-09-07: on an Arbitrum Orbit chain a plain transfer's gas includes the
  // L1 posting component, so 21000 is not what the node charges. The reserve
  // is measured from the node's own estimate, with the same headroom.
  it("measures the transfer's gas where a chain charges more than 21000", async () => {
    getGasPrice.mockResolvedValue(1_000_000_000n);
    estimateGas.mockResolvedValue(60_000n);
    expect(await nativeSendCost("apechain-mainnet")).toBeCloseTo(0.00009, 10);
  });

  it("never goes below the protocol minimum, and falls back to it when the node will not estimate", async () => {
    getGasPrice.mockResolvedValue(1_000_000_000n);
    estimateGas.mockResolvedValue(10_000n);
    expect(await nativeSendCost("hyperliquid-mainnet")).toBeCloseTo(0.0000315, 10);
    estimateGas.mockRejectedValue(new Error("method not supported"));
    expect(await nativeSendCost("hyperliquid-mainnet")).toBeCloseTo(0.0000315, 10);
  });
});
