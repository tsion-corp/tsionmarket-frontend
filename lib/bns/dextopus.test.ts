import { describe, expect, it } from "vitest";
import { formatUsdcForNativeEth, minimumUsdcForNativeEth, nextUsdcQuoteAmount } from "./dextopus";

describe("Ark ID Dextopus funding amounts", () => {
  it("estimates enough USDC for native ETH with a price buffer", () => {
    expect(minimumUsdcForNativeEth(10n ** 15n, 2_000)).toBe(2_300_000n);
  });

  it("uses the minimum Dextopus input for a low-priced name", () => {
    expect(minimumUsdcForNativeEth(1n, 2_000)).toBe(1_000_000n);
  });

  it("shows the live ETH fee as a rounded USDC amount", () => {
    expect(formatUsdcForNativeEth(10n ** 15n, 2_000)).toBe("2.00");
    expect(formatUsdcForNativeEth(1n, 2_000)).toBe("0.01");
    expect(formatUsdcForNativeEth(1n, 0)).toBeNull();
  });

  it("increases the next quote until its minimum output covers the fee", () => {
    expect(nextUsdcQuoteAmount(2_000_000n, 10n ** 15n, 900_000_000_000_000n)).toBe(2_333_334n);
  });

  it("rejects missing ETH pricing and empty quotes", () => {
    expect(() => minimumUsdcForNativeEth(1n, 0)).toThrow("ETH price");
    expect(() => nextUsdcQuoteAmount(1_000_000n, 1n, 0n)).toThrow("no ETH");
  });
});
