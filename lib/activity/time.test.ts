import { describe, expect, it } from "vitest";
import { clockTime, fullTimestamp, relativeTime, resolveRelativeTime } from "@/lib/activity/time";

const NOW = Date.UTC(2026, 8, 9, 12, 0, 0);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("picks the same thresholds the row has always used", () => {
    expect(relativeTime(NOW, NOW)).toEqual({ type: "message", key: "justNow" });
    expect(relativeTime(NOW - 59 * SECOND, NOW)).toEqual({ type: "message", key: "justNow" });
    expect(relativeTime(NOW - MINUTE, NOW)).toEqual({
      type: "message",
      key: "minutesAgo",
      values: { n: 1 },
    });
    expect(relativeTime(NOW - 59 * MINUTE, NOW)).toEqual({
      type: "message",
      key: "minutesAgo",
      values: { n: 59 },
    });
    expect(relativeTime(NOW - HOUR, NOW)).toEqual({
      type: "message",
      key: "hoursAgo",
      values: { n: 1 },
    });
    expect(relativeTime(NOW - 23 * HOUR, NOW)).toEqual({
      type: "message",
      key: "hoursAgo",
      values: { n: 23 },
    });
    expect(relativeTime(NOW - DAY, NOW)).toEqual({
      type: "message",
      key: "daysAgo",
      values: { n: 1 },
    });
    expect(relativeTime(NOW - 9 * DAY, NOW)).toEqual({
      type: "message",
      key: "daysAgo",
      values: { n: 9 },
    });
  });

  it("clamps a timestamp from the future to just now", () => {
    expect(relativeTime(NOW + HOUR, NOW)).toEqual({ type: "message", key: "justNow" });
  });

  it("resolves through a translator the way the row renders it", () => {
    const t = (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${JSON.stringify(values)}` : key;
    expect(resolveRelativeTime(NOW - 5 * MINUTE, t, NOW)).toBe('minutesAgo:{"n":5}');
    expect(resolveRelativeTime(NOW, t, NOW)).toBe("justNow");
  });
});

describe("clockTime", () => {
  it("reads 24 hour on a US locale, which is what the design shows", () => {
    const afternoon = new Date(2026, 8, 9, 14, 38).getTime();
    expect(clockTime(afternoon, "en-US")).toBe("14:38");
    expect(clockTime(afternoon, "en-GB")).toBe("14:38");
    expect(clockTime(afternoon, "de-DE")).toBe("14:38");
  });

  it("pads the morning hour so the column stays one width", () => {
    expect(clockTime(new Date(2026, 8, 9, 9, 5).getTime(), "en-US")).toBe("09:05");
    expect(clockTime(new Date(2026, 8, 9, 0, 7).getTime(), "en-US")).toBe("00:07");
  });
});

describe("fullTimestamp", () => {
  it("gives the whole stamp for the row's tooltip", () => {
    const stamp = fullTimestamp(new Date(2026, 8, 9, 14, 38).getTime(), "en-US");
    expect(stamp).toContain("2026");
    expect(stamp).toContain("Sep");
  });
});
