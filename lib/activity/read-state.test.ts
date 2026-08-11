import { describe, expect, it } from "vitest";
import { unreadBadge, unreadEntries, UNREAD_CAP } from "@/lib/activity/read-state";
import type { ActivityEntry } from "@/lib/activity/entries";

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;

function entry(timestamp: number, id = String(timestamp)): ActivityEntry {
  return {
    id,
    hash: id,
    network: "solana-mainnet",
    timestamp,
    kind: "bought",
    symbol: "GLDx",
    amount: 1,
    direction: "in",
    counterparty: null,
    logo: null,
  };
}

describe("unreadEntries", () => {
  it("counts only what landed after the bell was last opened", () => {
    const entries = [entry(NOW - HOUR), entry(NOW - 3 * HOUR), entry(NOW - 5 * HOUR)];
    expect(unreadEntries(entries, NOW - 4 * HOUR)).toHaveLength(2);
  });

  it("treats everything as read right after opening", () => {
    expect(unreadEntries([entry(NOW - HOUR)], NOW)).toHaveLength(0);
  });

  it("shows nothing until the marker is known", () => {
    // Zero means "not read yet from storage", not "read nothing" — otherwise
    // hydration would flash a badge for the whole history and take it away.
    const old = entry(NOW - 30 * 24 * HOUR);
    expect(unreadEntries([old, entry(NOW - HOUR)], 0)).toHaveLength(0);
  });

  it("ignores entries with no usable timestamp", () => {
    expect(unreadEntries([entry(0, "no-time")], NOW - HOUR)).toHaveLength(0);
  });
});

describe("unreadBadge", () => {
  it("shows nothing when there is nothing new", () => {
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(-1)).toBeNull();
  });

  it("shows the count, capped so a backfill cannot widen the badge", () => {
    expect(unreadBadge(1)).toBe("1");
    expect(unreadBadge(UNREAD_CAP)).toBe(String(UNREAD_CAP));
    expect(unreadBadge(UNREAD_CAP + 1)).toBe(`${UNREAD_CAP}+`);
    expect(unreadBadge(2451)).toBe(`${UNREAD_CAP}+`);
  });
});
