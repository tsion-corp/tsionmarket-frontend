import { describe, it, expect } from "vitest";
import { parseStakeToMinor, stakeBreakdown, formatCasinoAmount } from "@/lib/casino/stakes";

describe("casino stake math", () => {
  it("parses whole and fractional stakes into minor units exactly", () => {
    expect(parseStakeToMinor("50000")).toBe(5_000_000);
    expect(parseStakeToMinor("340.50")).toBe(34_050);
    expect(parseStakeToMinor("4.2")).toBe(420);
    expect(parseStakeToMinor("0.01")).toBe(1);
  });

  it("truncates extra decimal places instead of rounding up money", () => {
    expect(parseStakeToMinor("1.999")).toBe(199);
  });

  it("returns 0 for empty or junk input", () => {
    expect(parseStakeToMinor("")).toBe(0);
    expect(parseStakeToMinor("abc")).toBe(0);
    expect(parseStakeToMinor("₦")).toBe(0);
  });

  it("computes pot, 5% fee, and potential winnings exactly", () => {
    // ₦50,000 stake: pot ₦100,000, fee ₦5,000, potential ₦95,000.
    const b = stakeBreakdown(5_000_000);
    expect(b.potMinor).toBe(10_000_000);
    expect(b.feeMinor).toBe(500_000);
    expect(b.potentialMinor).toBe(9_500_000);
  });

  it("floors the fee so the winner never pays a fraction of a minor unit extra", () => {
    // Pot of 3 minor units: 5% is 0.15, floored to 0.
    const b = stakeBreakdown(1);
    expect(b.potMinor).toBe(2);
    expect(b.feeMinor).toBe(0);
    expect(b.potentialMinor).toBe(2);
  });

  it("formats each currency in its display shape", () => {
    expect(formatCasinoAmount(5_000_000, "NGN")).toBe("₦50,000");
    expect(formatCasinoAmount(34_050, "USDC")).toBe("340.50 USDC");
    expect(formatCasinoAmount(420, "SOL")).toBe("4.20 SOL");
  });
});
