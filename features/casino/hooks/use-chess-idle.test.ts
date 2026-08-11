import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChessIdle } from "@/features/casino/hooks/use-chess-idle";

// The nudges decide when a game is abandoned and eventually resign it for the
// player, so the thresholds are pinned exactly: firing early throws away a game
// somebody is still thinking about.

// A 5+3: 300s a side, so 10% is 30s, 20% is 60s and 30% is 90s.
const INITIAL = 300;
const START = new Date("2026-07-30T12:00:00.000Z");

function setup(over: Partial<Parameters<typeof useChessIdle>[0]> = {}) {
  const onAutoResign = vi.fn();
  const view = renderHook((props: Parameters<typeof useChessIdle>[0]) => useChessIdle(props), {
    initialProps: {
      active: true,
      initialSeconds: INITIAL,
      since: START.toISOString(),
      turnKey: 1,
      onAutoResign,
      ...over,
    },
  });
  return { ...view, onAutoResign };
}

// Advances both the clock the hook reads and the timer it ticks on.
function advance(seconds: number) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("idle nudges", () => {
  it("says nothing while the player is thinking normally", () => {
    const { result } = setup();
    advance(29);
    expect(result.current.pending).toBeNull();
  });

  it("asks once a tenth of the clock has gone", () => {
    const { result } = setup();
    advance(31);
    expect(result.current.pending).toBe(0.1);
  });

  it("asks again at a fifth, after the first was dismissed", () => {
    const { result } = setup();
    advance(31);
    act(() => result.current.dismiss());
    expect(result.current.pending).toBeNull();

    advance(30);
    expect(result.current.pending).toBe(0.2);
  });

  it("does not re-ask a threshold that was already dismissed", () => {
    const { result } = setup();
    advance(31);
    act(() => result.current.dismiss());
    advance(5);
    expect(result.current.pending).toBeNull();
  });

  it("resigns at three tenths, and only once", () => {
    const { result, onAutoResign } = setup();
    advance(91);
    expect(onAutoResign).toHaveBeenCalledTimes(1);
    // The question is moot once the game has been resigned.
    expect(result.current.pending).toBeNull();

    advance(60);
    expect(onAutoResign).toHaveBeenCalledTimes(1);
  });

  it("starts over when a move is played", () => {
    const { result, rerender, onAutoResign } = setup();
    advance(31);
    expect(result.current.pending).toBe(0.1);

    // A move: new turn, new clock reference.
    const movedAt = new Date(START.getTime() + 31_000).toISOString();
    rerender({
      active: true,
      initialSeconds: INITIAL,
      since: movedAt,
      turnKey: 2,
      onAutoResign,
    });
    expect(result.current.pending).toBeNull();

    advance(29);
    expect(result.current.pending).toBeNull();
    advance(2);
    expect(result.current.pending).toBe(0.1);
  });

  // Waiting on an opponent is not idling, and neither is watching.
  it("stays quiet when it is not this player's move", () => {
    const { result, onAutoResign } = setup({ active: false });
    advance(200);
    expect(result.current.pending).toBeNull();
    expect(onAutoResign).not.toHaveBeenCalled();
  });

  it("scales with the time control", () => {
    // A 15+10 is 900s a side, so the first nudge is at 90s, not 30s.
    const { result } = setup({ initialSeconds: 900 });
    advance(31);
    expect(result.current.pending).toBeNull();
    advance(60);
    expect(result.current.pending).toBe(0.1);
  });

  it("does nothing without a usable clock or timestamp", () => {
    const noClock = setup({ initialSeconds: 0 });
    advance(500);
    expect(noClock.onAutoResign).not.toHaveBeenCalled();

    const noStamp = setup({ since: "not-a-date" });
    advance(500);
    expect(noStamp.onAutoResign).not.toHaveBeenCalled();
  });
});
