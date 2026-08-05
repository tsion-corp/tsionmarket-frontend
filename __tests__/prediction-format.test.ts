import { describe, expect, it } from "vitest";
import {
  closeUrgency,
  formatCloseDateTime,
  formatReserve,
  timeUntil,
} from "@/lib/prediction/format";

// USDC/share reserves are 6-decimal base units.
const usdc = (whole: number) => BigInt(Math.round(whole * 1_000_000));

describe("formatReserve", () => {
  // The regression this exists for: a market at 3¢/97¢ holds ~0.186 NO shares
  // against ~6 YES. toFixed(0) printed that as "0", which reads as "this side
  // has no liquidity" when the pool is merely skewed.
  it("never prints a real balance as zero", () => {
    expect(formatReserve(usdc(0.185567))).toBe("0.1856");
    expect(formatReserve(usdc(0.01))).toBe("0.0100");
    expect(formatReserve(1n)).toBe("<0.0001");
  });

  it("is exactly zero only when the reserve is empty", () => {
    expect(formatReserve(0n)).toBe("0");
  });

  it("drops decimals as the reserve grows", () => {
    expect(formatReserve(usdc(6))).toBe("6.00");
    expect(formatReserve(usdc(1234.56))).toBe("1235");
  });
});

describe("closeUrgency", () => {
  const now = 1_800_000_000_000;
  const at = (secondsOut: number) => now / 1000 + secondsOut;

  it("escalates as the close time approaches", () => {
    expect(closeUrgency(at(48 * 3600), now)).toBe("none");
    expect(closeUrgency(at(90 * 60), now)).toBe("none");
    expect(closeUrgency(at(45 * 60), now)).toBe("soon");
    expect(closeUrgency(at(9 * 60), now)).toBe("imminent");
    expect(closeUrgency(at(5), now)).toBe("imminent");
  });

  it("treats the thresholds themselves as the tighter state", () => {
    expect(closeUrgency(at(60 * 60), now)).toBe("soon");
    expect(closeUrgency(at(10 * 60), now)).toBe("imminent");
  });

  // Past close the caller shows a status label, so there is no urgency to show.
  it("is none once the market has closed or the time is unknown", () => {
    expect(closeUrgency(at(-1), now)).toBe("none");
    expect(closeUrgency(0, now)).toBe("none");
    expect(closeUrgency(null, now)).toBe("none");
  });
});

describe("formatCloseDateTime", () => {
  it("carries the time, not just the date", () => {
    // A market closing later today must not read as a bare date.
    const out = formatCloseDateTime(1_800_000_000);
    expect(out).not.toBe("");
    expect(out).toMatch(/\d{1,2}:\d{2}/);
  });

  it("returns an empty string when there is no usable close time", () => {
    expect(formatCloseDateTime(null)).toBe("");
    expect(formatCloseDateTime(0)).toBe("");
    expect(formatCloseDateTime(Number.NaN)).toBe("");
  });
});

describe("timeUntil", () => {
  const now = 1_800_000_000_000;
  const at = (secondsOut: number) => now / 1000 + secondsOut;

  // Seconds are what make the countdown read as a live deadline rather than a
  // static label, so they are carried through the whole sub-day range.
  it("carries seconds for anything closing inside a day", () => {
    expect(timeUntil(at(23 * 3600 + 35 * 60 + 12), now)).toBe("23h 35m 12s");
    expect(timeUntil(at(9 * 60 + 30), now)).toBe("9m 30s");
    expect(timeUntil(at(45), now)).toBe("45s");
  });

  // Past a day the seconds are noise, and ticking for them buys nothing.
  it("drops to two units past a day out", () => {
    expect(timeUntil(at(2 * 86_400 + 4 * 3600), now)).toBe("2d 4h");
    expect(timeUntil(at(3 * 86_400), now)).toBe("3d");
  });

  it("returns null once the close time has passed", () => {
    expect(timeUntil(at(-1), now)).toBeNull();
  });
});
