import { describe, expect, it } from "vitest";
import { formatTokenVolumeAsUsdc, formatUsdcVolume } from "./market-volume";

describe("sportsbook market volume", () => {
  it("matches the compact USDC values used by the market list", () => {
    expect(formatUsdcVolume("10616.459107482278")).toBe("10.6K USDC");
    expect(formatUsdcVolume("5006.550032784555")).toBe("5K USDC");
    expect(formatUsdcVolume("519.9335394705097")).toBe("519.93 USDC");
    expect(formatUsdcVolume("466")).toBe("466 USDC");
    expect(formatUsdcVolume("0.004")).toBe("<0.01 USDC");
    expect(formatUsdcVolume("0")).toBe("-");
  });

  it("converts Base WETH turnover into the USDC presentation currency", () => {
    expect(formatTokenVolumeAsUsdc("0.501", "WETH", 4_000)).toBe("2K USDC");
    expect(formatTokenVolumeAsUsdc("2", "WETH", 4_000)).toBe("8K USDC");
  });

  it("does not round positive small USDC turnover down to zero", () => {
    expect(formatTokenVolumeAsUsdc("0.000001", "WETH", 4_000)).toBe("<0.01 USDC");
    expect(formatTokenVolumeAsUsdc("0", "WETH", 4_000)).toBe("-");
  });
});
