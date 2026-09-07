import { beforeEach, describe, expect, it, vi } from "vitest";

const { getGasPrice, estimateGas, getBlock, estimateMaxPriorityFeePerGas } = vi.hoisted(() => ({
  getGasPrice: vi.fn(),
  estimateGas: vi.fn(),
  getBlock: vi.fn(),
  estimateMaxPriorityFeePerGas: vi.fn(),
}));
vi.mock("@/lib/trade/receipt", () => ({
  isReceiptChain: (id: number) => id === 999 || id === 33139,
  publicClientForChain: () => ({
    getGasPrice,
    estimateGas,
    getBlock,
    estimateMaxPriorityFeePerGas,
  }),
}));

import { nativeSendCost } from "@/lib/trade/native-gas";

describe("nativeSendCost", () => {
  beforeEach(() => {
    estimateGas.mockReset();
    estimateGas.mockResolvedValue(21_000n);
    // A legacy-fee chain by default: no base fee, so the gas price is the cap.
    getBlock.mockReset();
    getBlock.mockResolvedValue({ baseFeePerGas: null });
    estimateMaxPriorityFeePerGas.mockReset();
    estimateMaxPriorityFeePerGas.mockResolvedValue(0n);
  });

  // 21000 gas at 1 gwei is 0.000021 native, and the reserve carries half again
  // because the price can rise between this read and inclusion.
  it("prices a transfer from the live gas price, with headroom", async () => {
    getGasPrice.mockResolvedValue(1_000_000_000n);
    expect(await nativeSendCost("hyperliquid-mainnet")).toBeCloseTo(0.00002625, 10);
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
    expect(await nativeSendCost("apechain-mainnet")).toBeCloseTo(0.000075, 10);
  });

  it("never goes below the protocol minimum, and falls back to it when the node will not estimate", async () => {
    getGasPrice.mockResolvedValue(1_000_000_000n);
    estimateGas.mockResolvedValue(10_000n);
    expect(await nativeSendCost("hyperliquid-mainnet")).toBeCloseTo(0.00002625, 10);
    estimateGas.mockRejectedValue(new Error("method not supported"));
    expect(await nativeSendCost("hyperliquid-mainnet")).toBeCloseTo(0.00002625, 10);
  });

  // Second APE failure, 2026-09-07, with the measured gas in place: the node
  // answered "gas required exceeds allowance (15876)" against a reserve of
  // 0.003236 APE. The implied fee was 203.8 gwei, exactly twice the 101.7 gwei
  // base fee: a wallet sends with a fee cap of 2 × base fee + tip, and the node
  // requires the balance to cover gas at that cap, not at the spot gas price.
  it("reserves against the wallet's fee cap, twice the base fee plus the tip, where a chain has one", async () => {
    getGasPrice.mockResolvedValue(101_682_760_000n);
    getBlock.mockResolvedValue({ baseFeePerGas: 101_682_760_000n });
    estimateMaxPriorityFeePerGas.mockResolvedValue(0n);
    estimateGas.mockResolvedValue(21_169n);
    const reserve = await nativeSendCost("apechain-mainnet");
    // Must cover 21169 gas at 2 × base fee (0.0043050 APE), with headroom.
    expect(reserve).toBeGreaterThan(0.0043050446);
    expect(reserve).toBeLessThan(0.0043050446 * 1.6);
  });
});
