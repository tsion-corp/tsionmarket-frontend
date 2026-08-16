import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_REMEMBERED,
  mergeHashes,
  normalizeHash,
  readSelfInitiated,
  recordSelfInitiated,
} from "@/lib/analytics/self-initiated";

describe("normalizeHash", () => {
  it("compares hashes case-insensitively, because the sources disagree on case", () => {
    expect(normalizeHash("  0xAbC  ")).toBe("0xabc");
  });
});

describe("mergeHashes", () => {
  it("adds new hashes, oldest first", () => {
    expect(mergeHashes(["0xa"], ["0xb"])).toEqual(["0xa", "0xb"]);
  });

  it("does not record the same transaction twice, whatever its case", () => {
    expect(mergeHashes(["0xa"], ["0xA", "0xa"])).toEqual(["0xa"]);
  });

  it("ignores empty values rather than storing a hash that matches nothing", () => {
    expect(mergeHashes([], ["", "   ", "0xa"])).toEqual(["0xa"]);
  });

  it("caps the record by dropping the oldest", () => {
    const existing = Array.from({ length: MAX_REMEMBERED }, (_, i) => `0xold${i}`);
    const next = mergeHashes(existing, ["0xnew"]);
    expect(next).toHaveLength(MAX_REMEMBERED);
    expect(next.at(-1)).toBe("0xnew");
    expect(next).not.toContain("0xold0");
  });
});

describe("recordSelfInitiated", () => {
  beforeEach(() => window.localStorage.clear());

  it("survives a round trip so a later visit still rules the transfer out", () => {
    recordSelfInitiated(["0xAbC"]);
    expect(readSelfInitiated().has("0xabc")).toBe(true);
  });

  it("accumulates across calls", () => {
    recordSelfInitiated(["0xa"]);
    recordSelfInitiated(["0xb"]);
    const stored = readSelfInitiated();
    expect(stored.has("0xa")).toBe(true);
    expect(stored.has("0xb")).toBe(true);
  });

  it("reads as empty when the store holds something that is not a list", () => {
    window.localStorage.setItem("wsws.analytics.self-initiated.v1", '{"not":"a list"}');
    expect(readSelfInitiated().size).toBe(0);
  });
});
