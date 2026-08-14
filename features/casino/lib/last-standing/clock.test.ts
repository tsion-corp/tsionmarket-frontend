import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRemaining, secondsUntil, subscribeToClock } from "./clock";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("formatRemaining", () => {
  it("reads as m:ss under an hour", () => {
    expect(formatRemaining(9)).toBe("0:09");
    expect(formatRemaining(62)).toBe("1:02");
    expect(formatRemaining(600)).toBe("10:00");
  });

  it("adds hours only when there are some", () => {
    expect(formatRemaining(3600)).toBe("1:00:00");
    expect(formatRemaining(3725)).toBe("1:02:05");
  });

  it("never shows a negative clock", () => {
    expect(formatRemaining(-5)).toBe("0:00");
  });
});

describe("secondsUntil", () => {
  it("counts from the wall clock, so a slept tab is right on wake", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T00:00:00Z"));
    const endTime = Math.floor(Date.now() / 1000) + 30;
    expect(secondsUntil(endTime)).toBe(30);

    // The tab was away for 25 seconds. A counted-down snapshot would still say
    // 30; deriving from the clock says 5.
    vi.setSystemTime(new Date("2026-08-14T00:00:25Z"));
    expect(secondsUntil(endTime)).toBe(5);
  });

  it("floors at zero once the timer has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T00:00:00Z"));
    expect(secondsUntil(Math.floor(Date.now() / 1000) - 10)).toBe(0);
  });
});

describe("subscribeToClock", () => {
  it("drives every subscriber from one interval", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(globalThis, "setInterval");
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeToClock(a);
    const offB = subscribeToClock(b);

    // Two countdowns, one timer.
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    offA();
    offB();
  });

  it("stops ticking once nothing is listening", () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, "clearInterval");
    const off = subscribeToClock(vi.fn());
    off();
    expect(clear).toHaveBeenCalled();
  });

  it("keeps ticking while one of two subscribers leaves", () => {
    vi.useFakeTimers();
    const staying = vi.fn();
    const offLeaving = subscribeToClock(vi.fn());
    const offStaying = subscribeToClock(staying);
    offLeaving();
    vi.advanceTimersByTime(1000);
    expect(staying).toHaveBeenCalledTimes(1);
    offStaying();
  });
});
