import { describe, expect, it } from "vitest";
import { parseVisemeTrack, visemeAt } from "@/features/casino/lib/chess/coach-audio";

describe("puzzle coach visemes", () => {
  it("parses, filters, and orders captured cues", () => {
    expect(parseVisemeTrack('[[3,140],[9,0],[2,-1],[1,60],["bad",80]]')).toEqual([
      { viseme: 9, ms: 0 },
      { viseme: 1, ms: 60 },
      { viseme: 3, ms: 140 },
    ]);
  });

  it("returns the latest cue at the playback position", () => {
    const track = parseVisemeTrack("[[9,0],[1,60],[3,140]]");
    expect(visemeAt(track, -1)).toBeNull();
    expect(visemeAt(track, 0)).toBe(9);
    expect(visemeAt(track, 139)).toBe(1);
    expect(visemeAt(track, 500)).toBe(3);
  });

  it("fails closed for invalid input", () => {
    expect(parseVisemeTrack("not-json")).toEqual([]);
    expect(parseVisemeTrack("{}")).toEqual([]);
  });
});
