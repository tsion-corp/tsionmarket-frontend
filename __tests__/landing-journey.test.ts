import { describe, expect, it } from "vitest";
import {
  FILM,
  WAYPOINTS,
  copyOpacity,
  journeyFrame,
  journeyMetrics,
  revealShown,
  scrimGradient,
  scrubTarget,
} from "@/lib/landing/journey";

const m = journeyMetrics(1000);

describe("journeyMetrics", () => {
  it("derives holds, transit and track from the viewport", () => {
    // Waypoint 0 is a held composition with nothing to reveal, so its hold is
    // a short beat; every later waypoint gets the full hold.
    expect(m.holds[0]).toBeCloseTo(385);
    expect(m.holds[1]).toBe(1100);
    expect(m.holds[8]).toBe(1100);
    expect(m.transit).toBeCloseTo(902);
    expect(m.starts[0]).toBe(0);
    expect(m.starts[1]).toBeCloseTo(385 + 902);
    expect(m.starts[2]).toBeCloseTo(385 + 902 + 1100 + 902);
    expect(m.trackHeight).toBeCloseTo(m.starts[8] + 1100 + 1500);
  });

  it("floors the distances on tiny viewports", () => {
    const tiny = journeyMetrics(300);
    expect(tiny.holds[0]).toBe(180);
    expect(tiny.holds[1]).toBe(420);
    expect(tiny.transit).toBe(360);
  });
});

describe("journeyFrame", () => {
  it("starts at waypoint 0 in hold", () => {
    expect(journeyFrame(0, m)).toEqual({ i: 0, inHold: true, p: 0 });
  });

  it("moves into the transit after the enter hold's short beat", () => {
    const f = journeyFrame(m.holds[0] + m.transit / 2, m);
    expect(f.i).toBe(0);
    expect(f.inHold).toBe(false);
    expect(f.p).toBeCloseTo(0.5);
  });

  it("advances per waypoint start and clamps at the last", () => {
    expect(journeyFrame(m.starts[3] + 10, m).i).toBe(3);
    expect(journeyFrame(m.starts[3] - 1, m).i).toBe(2);
    const end = journeyFrame(m.trackHeight * 3, m);
    expect(end.i).toBe(WAYPOINTS - 1);
    // The last waypoint holds forever.
    expect(end.inHold).toBe(true);
  });

  it("never lets progress escape 0..1 or the index go negative", () => {
    expect(journeyFrame(-500, m).i).toBe(0);
    expect(journeyFrame(-500, m).p).toBe(0);
  });
});

describe("copyOpacity handoff", () => {
  it("shows only the active layer during a hold", () => {
    const f = { i: 2, inHold: true, p: 0.5 };
    expect(copyOpacity(2, f)).toBe(1);
    expect(copyOpacity(1, f)).toBe(0);
    expect(copyOpacity(3, f)).toBe(0);
  });

  it("fades out over the first 42% and in over the last 42%", () => {
    expect(copyOpacity(2, { i: 2, inHold: false, p: 0.21 })).toBeCloseTo(0.5);
    expect(copyOpacity(2, { i: 2, inHold: false, p: 0.42 })).toBe(0);
    // Dead zone in the middle: neither layer visible.
    expect(copyOpacity(2, { i: 2, inHold: false, p: 0.5 })).toBe(0);
    expect(copyOpacity(3, { i: 2, inHold: false, p: 0.5 })).toBe(0);
    expect(copyOpacity(3, { i: 2, inHold: false, p: 0.79 })).toBeCloseTo(0.5);
    expect(copyOpacity(3, { i: 2, inHold: false, p: 1 })).toBe(1);
  });
});

describe("revealShown", () => {
  it("staggers items across the reveal window during a hold", () => {
    const total = 4;
    expect(revealShown(0, total, { i: 1, inHold: true, p: 0 }, 1)).toBe(true);
    expect(revealShown(2, total, { i: 1, inHold: true, p: 0.3 }, 1)).toBe(false);
    expect(revealShown(2, total, { i: 1, inHold: true, p: 0.32 }, 1)).toBe(true);
    // All reveals done by 66% of the hold.
    expect(revealShown(3, total, { i: 1, inHold: true, p: 0.47 }, 1)).toBe(true);
  });

  it("waypoint 0 is a held composition, whole from first paint", () => {
    expect(revealShown(2, 3, { i: 0, inHold: true, p: 0 }, 0)).toBe(true);
  });

  it("keeps the whole layer shown during a transit handoff", () => {
    expect(revealShown(3, 4, { i: 1, inHold: false, p: 0.1 }, 1)).toBe(true);
  });
});

describe("scrubTarget", () => {
  it("maps progress to time, clamped clear of the final frame", () => {
    expect(scrubTarget(0.5, 5, 0)).toBeCloseTo(2.5);
    expect(scrubTarget(1, 5, 0)).toBeCloseTo(4.95);
  });

  it("skips writes inside the deadband and on bad durations", () => {
    expect(scrubTarget(0.5, 5, 2.49)).toBeNull();
    expect(scrubTarget(0.5, NaN, 0)).toBeNull();
    expect(scrubTarget(0.5, 0, 0)).toBeNull();
  });
});

describe("film manifest", () => {
  it("has nine waypoints and no transit out of the last", () => {
    expect(FILM).toHaveLength(9);
    expect(FILM[8].transit).toBeNull();
    expect(FILM[0]).toEqual({
      still: "/film/w0-still.jpg",
      ambient: "/film/w0-amb.mp4",
      transit: "/film/w0-transit.mp4",
    });
  });
});

describe("scrimGradient", () => {
  it("builds the four-stop legibility gradient from one strength", () => {
    const g = scrimGradient(0.62);
    expect(g).toContain("rgba(0,0,0,0.62) 0%");
    expect(g).toContain("rgba(0,0,0,0.19) 30%");
    expect(g).toContain("rgba(0,0,0,0.28) 62%");
    expect(g).toContain("rgba(0,0,0,0.83) 100%");
  });
});
