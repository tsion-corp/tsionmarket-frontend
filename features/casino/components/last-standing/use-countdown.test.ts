import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCountdown } from "./use-countdown";

describe("useCountdown", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ticks down locally while the round is live", () => {
    const { result } = renderHook(() => useCountdown(30, true, false));
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current).toBe(27);
  });

  it("freezes while the connection is degraded and resumes after", () => {
    const { result, rerender } = renderHook(({ frozen }) => useCountdown(30, true, frozen), {
      initialProps: { frozen: false },
    });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toBe(28);
    rerender({ frozen: true });
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current).toBe(28);
    rerender({ frozen: false });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(27);
  });

  it("a fresh server value resets the clock even while frozen", () => {
    const { result, rerender } = renderHook(
      ({ server, frozen }) => useCountdown(server, true, frozen),
      { initialProps: { server: 30, frozen: true } }
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(30);
    rerender({ server: 44, frozen: true });
    expect(result.current).toBe(44);
  });

  it("never ticks below zero", () => {
    const { result } = renderHook(() => useCountdown(1, true, false));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
  });
});
