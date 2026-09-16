import { describe, expect, it, vi } from "vitest";
import {
  createStepwiseReplayScroll,
  replayTargetForKey,
} from "@/features/casino/lib/chess/round-navigation";

function wheelEvent(deltaY: number, options: { ctrlKey?: boolean; deltaMode?: number } = {}) {
  return {
    ctrlKey: options.ctrlKey ?? false,
    deltaMode: options.deltaMode ?? 0,
    deltaY,
    preventDefault: vi.fn(),
  };
}

describe("round replay navigation", () => {
  it("maps the Lichess replay keys to an authoritative ply", () => {
    expect(replayTargetForKey("ArrowLeft", 12, 20)).toBe(11);
    expect(replayTargetForKey("k", 12, 20)).toBe(11);
    expect(replayTargetForKey("ArrowRight", 12, 20)).toBe(13);
    expect(replayTargetForKey("j", 12, 20)).toBe(13);
    expect(replayTargetForKey("Home", 12, 20)).toBe(0);
    expect(replayTargetForKey("ArrowUp", 12, 20)).toBe(0);
    expect(replayTargetForKey("End", 12, 20)).toBe(20);
    expect(replayTargetForKey("ArrowDown", 12, 20)).toBe(20);
    expect(replayTargetForKey("x", 12, 20)).toBeNull();
  });

  it("turns a wheel gesture into one previous or next replay step", () => {
    const onStep = vi.fn();
    const handler = createStepwiseReplayScroll(onStep, () => false, false);
    const next = wheelEvent(100, { deltaMode: 1 });
    const previous = wheelEvent(-100, { deltaMode: 1 });

    handler(next);
    handler(previous);

    expect(onStep).toHaveBeenNthCalledWith(1, 1);
    expect(onStep).toHaveBeenNthCalledWith(2, -1);
    expect(next.preventDefault).toHaveBeenCalledOnce();
    expect(previous.preventDefault).toHaveBeenCalledOnce();
  });

  it("accumulates small macOS trackpad deltas before changing ply", () => {
    const onStep = vi.fn();
    const handler = createStepwiseReplayScroll(onStep, () => false, true);

    handler(wheelEvent(4));
    handler(wheelEvent(5));
    expect(onStep).not.toHaveBeenCalled();

    handler(wheelEvent(2));
    expect(onStep).toHaveBeenCalledOnce();
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it("leaves zoom gestures and live-game scrolling untouched", () => {
    const onStep = vi.fn();
    const skipped = createStepwiseReplayScroll(onStep, () => true, false);
    const live = wheelEvent(100);
    const zoom = wheelEvent(100, { ctrlKey: true });

    skipped(live);
    skipped(zoom);

    expect(onStep).not.toHaveBeenCalled();
    expect(live.preventDefault).not.toHaveBeenCalled();
    expect(zoom.preventDefault).not.toHaveBeenCalled();
  });
});
