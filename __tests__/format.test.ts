import { describe, expect, it } from "vitest";
import { parseMoney, timeAgo, truncateAddress } from "@/lib/format";
import { HOLDINGS } from "@/lib/data/dashboard";

describe("truncateAddress", () => {
  it("keeps the first six and last four characters", () => {
    expect(truncateAddress("0x1234567890abcdef1234567890abcdefabcd")).toBe("0x1234…abcd");
  });

  it("returns short addresses unchanged", () => {
    expect(truncateAddress("0x1234")).toBe("0x1234");
  });
});

describe("timeAgo", () => {
  const now = Date.UTC(2026, 0, 15, 12, 0, 0);
  const at = (ms: number) => new Date(now - ms).toISOString();

  it("reads fresh timestamps as 'just now'", () => {
    expect(timeAgo(at(10_000), now)).toBe("just now");
  });

  it("formats minutes, hours, and days", () => {
    expect(timeAgo(at(5 * 60_000), now)).toBe("5m ago");
    expect(timeAgo(at(3 * 3_600_000), now)).toBe("3h ago");
    expect(timeAgo(at(2 * 86_400_000), now)).toBe("2d ago");
  });

  it("falls back to a short date past a week", () => {
    expect(timeAgo(at(10 * 86_400_000), now)).toMatch(/Jan/);
  });

  it("returns an empty string for an invalid timestamp", () => {
    expect(timeAgo("not-a-date", now)).toBe("");
  });
});

describe("portfolio balance", () => {
  it("aggregates the demo holdings to the expected total", () => {
    const total = HOLDINGS.reduce((sum, h) => sum + parseMoney(h.value), 0);
    expect(total).toBe(48215);
  });
});
