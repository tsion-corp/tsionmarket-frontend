import { describe, expect, it } from "vitest";
import { startsIn } from "@/lib/square/starts-in";

// The "starts in" chip on a coming-soon room, as the Square's Home labels
// it: the largest whole unit, never a countdown. A room already open says so.
describe("startsIn", () => {
  const now = Date.parse("2026-09-12T08:00:00.000Z");

  it("counts days, then hours, then minutes", () => {
    expect(startsIn("2026-09-14T08:00:00.000Z", now)).toEqual({ unit: "day", count: 2 });
    expect(startsIn("2026-09-12T13:30:00.000Z", now)).toEqual({ unit: "hour", count: 5 });
    expect(startsIn("2026-09-12T08:20:00.000Z", now)).toEqual({ unit: "minute", count: 20 });
  });

  it("says now for a room whose time has come", () => {
    expect(startsIn("2026-09-12T08:00:00.000Z", now)).toEqual({ unit: "now", count: 0 });
    expect(startsIn("2026-09-12T07:00:00.000Z", now)).toEqual({ unit: "now", count: 0 });
  });

  it("gives nothing for a date it cannot read", () => {
    expect(startsIn("not a date", now)).toBeNull();
  });
});
