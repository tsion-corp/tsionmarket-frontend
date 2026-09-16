import { describe, expect, it } from "vitest";
import { formatCountdown, parseCloseTime } from "./use-countdown";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatCountdown", () => {
  it("draws the clock the design draws, days first, every field padded", () => {
    expect(formatCountdown(DAY + 46 * HOUR + 55 * MINUTE + 22 * SECOND)).toBe("02:22:55:22");
    expect(formatCountdown(3 * HOUR + 21 * MINUTE + 44 * SECOND)).toBe("00:03:21:44");
  });

  it("keeps null distinguishable from no time left", () => {
    // A market with no published deadline and a market that just closed are
    // different states, and the chip says different things for each.
    expect(formatCountdown(null)).toBeNull();
    expect(formatCountdown(0)).toBe("00:00:00:00");
  });

  it("never counts past zero into negative digits", () => {
    expect(formatCountdown(-5 * MINUTE)).toBe("00:00:00:00");
  });

  it("floors the part second rather than rounding a second up", () => {
    expect(formatCountdown(1999)).toBe("00:00:00:01");
  });

  it("lets the day field grow rather than truncating a long deadline", () => {
    // A wrong number is worse than a wide one.
    expect(formatCountdown(120 * DAY)).toBe("120:00:00:00");
  });

  it("refuses a value that is not a real duration", () => {
    expect(formatCountdown(Number.NaN)).toBeNull();
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("parseCloseTime", () => {
  it("reads the feed's ISO instant", () => {
    expect(parseCloseTime("2026-09-15T15:30:00Z")).toBe(Date.UTC(2026, 8, 15, 15, 30, 0));
  });

  it("treats a missing date as no deadline", () => {
    expect(parseCloseTime(undefined)).toBeNull();
    expect(parseCloseTime(null)).toBeNull();
    expect(parseCloseTime("")).toBeNull();
  });

  it("treats an unparseable date as no deadline rather than NaN", () => {
    // NaN here would reach the chip and render "NaN:NaN:NaN:NaN".
    expect(parseCloseTime("soon")).toBeNull();
  });
});
