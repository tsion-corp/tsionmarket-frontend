import { describe, expect, it } from "vitest";
import {
  fromBaseUnits,
  liquidationPrice,
  positionSize,
  receiveFromPrices,
  toBaseUnits,
} from "@/lib/trade/math";

describe("toBaseUnits", () => {
  it("scales a whole number by the token decimals", () => {
    expect(toBaseUnits("1", 9)).toBe(1_000_000_000n);
  });

  it("scales a fractional amount without floating point drift", () => {
    expect(toBaseUnits("1.5", 6)).toBe(1_500_000n);
    expect(toBaseUnits("0.000001", 6)).toBe(1n);
  });

  it("handles a leading decimal point", () => {
    expect(toBaseUnits(".5", 6)).toBe(500_000n);
  });

  it("truncates fractional digits beyond the token decimals", () => {
    expect(toBaseUnits("1.123456789", 6)).toBe(1_123_456n);
  });

  it("returns zero for empty or invalid input", () => {
    expect(toBaseUnits("", 6)).toBe(0n);
    expect(toBaseUnits("abc", 6)).toBe(0n);
    expect(toBaseUnits("1.2.3", 6)).toBe(0n);
  });
});

describe("fromBaseUnits", () => {
  it("formats base units back into a trimmed human amount", () => {
    expect(fromBaseUnits(1_000_000_000n, 9)).toBe("1");
    expect(fromBaseUnits(1_500_000n, 6)).toBe("1.5");
    expect(fromBaseUnits(1n, 6)).toBe("0.000001");
  });

  it("round-trips with toBaseUnits", () => {
    expect(fromBaseUnits(toBaseUnits("174.205", 6), 6)).toBe("174.205");
  });
});

describe("positionSize", () => {
  it("multiplies collateral by leverage", () => {
    expect(positionSize(2000, 10)).toBe(20000);
  });

  it("returns zero for non-positive inputs", () => {
    expect(positionSize(0, 10)).toBe(0);
    expect(positionSize(2000, 0)).toBe(0);
  });
});

describe("liquidationPrice", () => {
  it("sits below entry for a long and above entry for a short", () => {
    const long = liquidationPrice(100, 10, "long", 0.005);
    const short = liquidationPrice(100, 10, "short", 0.005);
    expect(long).toBeCloseTo(90.5, 6);
    expect(short).toBeCloseTo(109.5, 6);
  });

  it("moves the liquidation price closer to entry as leverage rises", () => {
    const low = liquidationPrice(100, 2, "long", 0.005);
    const high = liquidationPrice(100, 20, "long", 0.005);
    expect(high).toBeGreaterThan(low);
  });

  it("returns zero for invalid inputs", () => {
    expect(liquidationPrice(0, 10, "long")).toBe(0);
    expect(liquidationPrice(100, 0, "long")).toBe(0);
  });
});

describe("receiveFromPrices", () => {
  it("converts a pay amount through USD prices", () => {
    expect(receiveFromPrices(1000, 1, 174.2)).toBeCloseTo(5.740528, 6);
  });

  it("returns zero when a price is missing", () => {
    expect(receiveFromPrices(1000, 0, 174.2)).toBe(0);
    expect(receiveFromPrices(1000, 1, 0)).toBe(0);
  });
});
