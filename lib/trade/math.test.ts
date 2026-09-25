import { describe, expect, it } from "vitest";
import {
  closeFee,
  formatCompactUsd,
  formatSignedPercent,
  formatUsd,
  fromBaseUnits,
  inferBracketSide,
  liquidationPrice,
  openFee,
  positionSize,
  projectTriggerPnl,
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

describe("openFee", () => {
  it("is a flat rate on the notional size", () => {
    expect(openFee(10_000)).toBeCloseTo(8);
    expect(openFee(2500)).toBeCloseTo(2);
  });

  it("is zero for a non-positive size", () => {
    expect(openFee(0)).toBe(0);
    expect(openFee(-100)).toBe(0);
  });
});

describe("closeFee", () => {
  it("charges the same flat rate as openFee — both legs of a round trip", () => {
    expect(closeFee(10_000)).toBeCloseTo(8);
    expect(closeFee(2500)).toBeCloseTo(2);
  });

  it("is zero for a non-positive size", () => {
    expect(closeFee(0)).toBe(0);
    expect(closeFee(-100)).toBe(0);
  });
});

describe("formatUsd", () => {
  it("puts the sign before the currency symbol, not inside the number", () => {
    // toLocaleString on a negative value alone would read "$-1.00" — the
    // sign has to move outside the "$" for a loss to read naturally.
    expect(formatUsd(-1)).toBe("-$1.00");
    expect(formatUsd(-0.00819)).toBe("-$0.00819");
  });

  it("shows a positive value with no sign", () => {
    expect(formatUsd(1)).toBe("$1.00");
    expect(formatUsd(0.0091)).toBe("$0.0091");
  });

  it("shows more decimals for smaller magnitudes so a small value never rounds to zero", () => {
    expect(formatUsd(0.5)).toBe("$0.50");
    expect(formatUsd(0.001234)).toBe("$0.001234");
  });

  it("falls back to $0.00 for a non-finite value", () => {
    expect(formatUsd(NaN)).toBe("$0.00");
    expect(formatUsd(Infinity)).toBe("$0.00");
  });
});

// The design draws a plain "$" and an uppercase single-letter magnitude:
// "$1.3T", "$301.9B". These assertions are what pins that down, because the
// shape used to follow the runtime's locale, and an en-GB browser rendered the
// same market cap "US$1.58tn".
describe("formatCompactUsd", () => {
  it("shortens trillions", () => {
    expect(formatCompactUsd(1_580_000_000_000)).toBe("$1.6T");
  });

  it("shortens billions", () => {
    expect(formatCompactUsd(303_470_000_000)).toBe("$303.5B");
    expect(formatCompactUsd(99_840_000_000)).toBe("$99.8B");
  });

  it("shortens millions", () => {
    expect(formatCompactUsd(1_234_567)).toBe("$1.2M");
  });

  it("shortens thousands", () => {
    expect(formatCompactUsd(2_500)).toBe("$2.5K");
  });

  it("shows zero as a plain figure, not a dash", () => {
    expect(formatCompactUsd(0)).toBe("$0");
  });

  it("puts the sign of a negative value outside the symbol", () => {
    expect(formatCompactUsd(-61_480.14)).toBe("-$61.5K");
  });

  it("falls back to a dash for a non-finite value", () => {
    expect(formatCompactUsd(NaN)).toBe("—");
    expect(formatCompactUsd(Infinity)).toBe("—");
  });
});

describe("projectTriggerPnl", () => {
  // $100 margin at 10x on a $100 asset => 10 units, $1000 notional.
  const base = { entryPrice: 100, sizeBaseUnits: 10, marginUsd: 100 } as const;

  it("projects a long take-profit above entry as a leveraged gain", () => {
    // +10% price move on 10x margin is a +100% return on the $100 posted.
    const p = projectTriggerPnl({ ...base, side: "buy", triggerPrice: 110 });
    expect(p?.pnlUsd).toBeCloseTo(100);
    expect(p?.roePct).toBeCloseTo(100);
  });

  it("projects a long stop-loss below entry as a loss", () => {
    const p = projectTriggerPnl({ ...base, side: "buy", triggerPrice: 96 });
    expect(p?.pnlUsd).toBeCloseTo(-40);
    expect(p?.roePct).toBeCloseTo(-40);
  });

  it("flips direction for a short: profit below entry, loss above", () => {
    const tp = projectTriggerPnl({ ...base, side: "sell", triggerPrice: 90 });
    expect(tp?.pnlUsd).toBeCloseTo(100);
    expect(tp?.roePct).toBeCloseTo(100);
    const sl = projectTriggerPnl({ ...base, side: "sell", triggerPrice: 105 });
    expect(sl?.pnlUsd).toBeCloseTo(-50);
    expect(sl?.roePct).toBeCloseTo(-50);
  });

  it("returns null when any input is missing or non-positive", () => {
    expect(projectTriggerPnl({ ...base, side: "buy", triggerPrice: 0 })).toBeNull();
    expect(
      projectTriggerPnl({ ...base, side: "buy", triggerPrice: 110, sizeBaseUnits: 0 })
    ).toBeNull();
    expect(projectTriggerPnl({ ...base, side: "buy", triggerPrice: 110, marginUsd: 0 })).toBeNull();
  });
});

describe("formatSignedPercent", () => {
  it("signs gains and losses and drops decimals on whole/large values", () => {
    expect(formatSignedPercent(100)).toBe("+100%");
    expect(formatSignedPercent(25)).toBe("+25%");
    expect(formatSignedPercent(-40)).toBe("-40%");
  });

  it("keeps one decimal for small fractional moves", () => {
    expect(formatSignedPercent(12.5)).toBe("+12.5%");
    expect(formatSignedPercent(-3.25)).toBe("-3.3%");
    expect(formatSignedPercent(0)).toBe("0%");
  });
});

describe("inferBracketSide", () => {
  it("reads a long from a take profit above entry or a stop loss below it", () => {
    expect(inferBracketSide(100, 110, 0)).toBe("buy");
    expect(inferBracketSide(100, 0, 95)).toBe("buy");
  });

  it("reads a short from a take profit below entry or a stop loss above it", () => {
    expect(inferBracketSide(100, 90, 0)).toBe("sell");
    expect(inferBracketSide(100, 0, 105)).toBe("sell");
  });

  it("prefers the take profit when both legs are set", () => {
    // TP above entry => long, regardless of where the SL sits.
    expect(inferBracketSide(100, 110, 95)).toBe("buy");
    expect(inferBracketSide(100, 90, 105)).toBe("sell");
  });

  it("is null without an entry price or any leg to read", () => {
    expect(inferBracketSide(0, 110, 95)).toBeNull();
    expect(inferBracketSide(100, 0, 0)).toBeNull();
  });
});
