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

import { canPayNativeFee, nativeSendCost } from "@/lib/trade/native-gas";

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

// Reported from staging on 2026-09-12: a USD₮0 sale on HyperEVM, which pays
// its own gas since #401 unsponsored the chain, failed at the node with "gas
// required exceeds allowance". The sheet had let it through because the wallet
// held some HYPE, and "some" was the whole test.
describe("canPayNativeFee", () => {
  it("asks for the measured fee, not merely a non-zero balance", () => {
    expect(canPayNativeFee(0.00002, 0.0009)).toBe(false);
    expect(canPayNativeFee(0.0009, 0.0009)).toBe(true);
    expect(canPayNativeFee(1.5, 0.0009)).toBe(true);
  });

  it("falls back to the old test while the measurement is still out", () => {
    expect(canPayNativeFee(0, undefined)).toBe(false);
    expect(canPayNativeFee(0.00002, undefined)).toBe(true);
  });
});

// The same staging report, one layer down. The reserve above was measured from
// a plain value transfer, but a USD₮0 sale is an ERC-20 transfer, which costs
// about three times as much gas. So the gate asked for a third of the real fee
// and waved through a wallet that could not pay: topping up to just past it
// still failed at the node.
describe("nativeSendCost for a token send", () => {
  const TOKEN = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const FROM = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const TO = "0xcccccccccccccccccccccccccccccccccccccccc";

  beforeEach(() => {
    getGasPrice.mockResolvedValue(1_000_000_000n);
    getBlock.mockResolvedValue({ baseFeePerGas: null });
    estimateMaxPriorityFeePerGas.mockResolvedValue(0n);
  });

  it("estimates the token transfer itself, not a native send", async () => {
    estimateGas.mockResolvedValue(65_000n);
    await nativeSendCost("hyperliquid-mainnet", {
      tokenAddress: TOKEN,
      from: FROM,
      to: TO,
      amount: 1_000_000n,
    });
    const [call] = estimateGas.mock.calls.at(-1) ?? [];
    expect(call.to.toLowerCase()).toBe(TOKEN);
    expect(call.account).toBe(FROM);
    // transfer(address,uint256)
    expect(call.data.startsWith("0xa9059cbb")).toBe(true);
  });

  it("floors a token send at the ERC-20 minimum, well above a native transfer", async () => {
    estimateGas.mockResolvedValue(21_000n);
    const token = await nativeSendCost("hyperliquid-mainnet", {
      tokenAddress: TOKEN,
      from: FROM,
      to: TO,
      amount: 1n,
    });
    const native = await nativeSendCost("hyperliquid-mainnet");
    expect(token).toBeGreaterThan(native * 2.5);
  });

  // A wallet that cannot cover the transfer makes the node revert the
  // estimate. That is the exact case the gate exists for, so it must not
  // collapse back to the native floor and pass.
  it("keeps the ERC-20 floor when the node refuses to estimate", async () => {
    estimateGas.mockRejectedValue(new Error("execution reverted"));
    const token = await nativeSendCost("hyperliquid-mainnet", {
      tokenAddress: TOKEN,
      from: FROM,
      to: TO,
      amount: 1n,
    });
    expect(token).toBeCloseTo(0.08125e-3, 6);
  });

  it("leaves a native send exactly as it was", async () => {
    estimateGas.mockResolvedValue(21_000n);
    expect(await nativeSendCost("hyperliquid-mainnet", { tokenAddress: null })).toBeCloseTo(
      0.00002625,
      10
    );
  });
});
