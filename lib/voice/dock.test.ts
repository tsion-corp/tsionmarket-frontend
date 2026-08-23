import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_DOCK,
  DOCK_SIZE,
  clampDock,
  dockFromDrag,
  isDrag,
  loadDock,
  saveDock,
} from "@/lib/voice/dock";

const desktop = { width: 1440, height: 900 };

describe("clampDock", () => {
  it("leaves a position that already fits", () => {
    expect(clampDock({ right: 200, bottom: 300 }, desktop)).toEqual({ right: 200, bottom: 300 });
  });

  it("pulls a position back inside every edge", () => {
    expect(clampDock({ right: -50, bottom: -50 }, desktop)).toEqual({ right: 12, bottom: 12 });
    expect(clampDock({ right: 5000, bottom: 5000 }, desktop)).toEqual({
      right: desktop.width - DOCK_SIZE - 12,
      bottom: desktop.height - DOCK_SIZE - 12,
    });
  });

  // The case that strands the control: a spot saved on a wide window, restored
  // on a phone. It has to come back into reach rather than sit off-screen.
  it("rescues a desktop position opened on a phone", () => {
    const phone = { width: 390, height: 844 };
    const moved = clampDock({ right: 1200, bottom: 400 }, phone);
    expect(moved.right).toBeLessThanOrEqual(phone.width - DOCK_SIZE - 12);
    expect(moved.right).toBeGreaterThanOrEqual(12);
  });

  // A viewport too small for the control plus its margins would invert the
  // clamp. The lower bound has to win so it stays tappable.
  it("stays reachable in a viewport smaller than the control", () => {
    expect(clampDock({ right: 999, bottom: 999 }, { width: 40, height: 40 })).toEqual({
      right: 12,
      bottom: 12,
    });
  });
});

describe("dockFromDrag", () => {
  // Anchored to the bottom-right, so both axes invert: dragging toward the
  // right edge makes the right offset smaller.
  it("inverts both axes against the bottom-right anchor", () => {
    expect(dockFromDrag({ right: 100, bottom: 100 }, 30, 20)).toEqual({ right: 70, bottom: 80 });
    expect(dockFromDrag({ right: 100, bottom: 100 }, -30, -20)).toEqual({
      right: 130,
      bottom: 120,
    });
  });
});

describe("isDrag", () => {
  // A tap and the first pixel of a drag are identical; without the threshold
  // every attempt to move the control would also open a voice session.
  it("ignores the jitter of a tap", () => {
    expect(isDrag(0, 0)).toBe(false);
    expect(isDrag(3, 3)).toBe(false);
  });

  it("counts deliberate movement on either axis", () => {
    expect(isDrag(6, 0)).toBe(true);
    expect(isDrag(0, -6)).toBe(true);
    expect(isDrag(5, 5)).toBe(true);
  });
});

describe("dock persistence", () => {
  beforeEach(() => window.localStorage.clear());

  it("round-trips a position", () => {
    saveDock({ right: 140, bottom: 260 });
    expect(loadDock()).toEqual({ right: 140, bottom: 260 });
  });

  it("returns null when nothing is stored", () => {
    expect(loadDock()).toBeNull();
  });

  // Storage is user-writable, and a malformed value must never place the
  // control somewhere it cannot be reached.
  it("rejects a malformed or non-numeric value", () => {
    window.localStorage.setItem("ws.voice-dock.v2", "not json");
    expect(loadDock()).toBeNull();
    window.localStorage.setItem("ws.voice-dock.v2", JSON.stringify({ right: "x", bottom: 3 }));
    expect(loadDock()).toBeNull();
    window.localStorage.setItem("ws.voice-dock.v2", JSON.stringify({ right: null }));
    expect(loadDock()).toBeNull();
  });
});

describe("DEFAULT_DOCK", () => {
  it("starts clear of the viewport edges", () => {
    expect(clampDock(DEFAULT_DOCK, desktop)).toEqual(DEFAULT_DOCK);
  });
});
