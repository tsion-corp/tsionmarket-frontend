import { describe, expect, it } from "vitest";
import {
  applySafetyMargin,
  capUnwrapAmount,
  encodeWethWithdraw,
  estimateUsdcToSpend,
} from "@/lib/perp/gas-topup";

describe("applySafetyMargin", () => {
  it("adds 3% headroom to the raw deficit", () => {
    expect(applySafetyMargin(1_000_000n)).toBe(1_030_000n);
  });

  it("stays exactly zero for a zero deficit", () => {
    expect(applySafetyMargin(0n)).toBe(0n);
  });
});

describe("capUnwrapAmount", () => {
  it("returns the target when enough is available", () => {
    expect(capUnwrapAmount(500n, 300n)).toBe(300n);
  });

  it("returns everything available when it falls short of the target", () => {
    expect(capUnwrapAmount(200n, 300n)).toBe(200n);
  });

  it("handles an exact match without over- or under-shooting", () => {
    expect(capUnwrapAmount(300n, 300n)).toBe(300n);
  });
});

describe("estimateUsdcToSpend", () => {
  it("converts a native-ETH-wei deficit to a USDC estimate at the given price", () => {
    // 0.001 ETH at $2000/ETH = $2, above the dust floor.
    const wei = 1_000_000_000_000_000n; // 0.001 ETH
    expect(estimateUsdcToSpend(wei, 2000)).toBeCloseTo(2, 6);
  });

  it("floors at the minimum viable buy size for a tiny deficit", () => {
    const dust = 1n; // effectively zero ETH
    expect(estimateUsdcToSpend(dust, 2000)).toBe(1);
  });
});

describe("encodeWethWithdraw", () => {
  it("encodes the withdraw(uint256) selector followed by the amount", () => {
    const data = encodeWethWithdraw(1n);
    expect(data.startsWith("0x2e1a7d4d")).toBe(true);
    expect(data).toBe(`0x2e1a7d4d${"0".repeat(63)}1`);
  });

  it("round-trips a larger amount without precision loss", () => {
    const amount = 123_456_789_000_000_000n;
    const data = encodeWethWithdraw(amount);
    expect(BigInt(`0x${data.slice(10)}`)).toBe(amount);
  });
});
