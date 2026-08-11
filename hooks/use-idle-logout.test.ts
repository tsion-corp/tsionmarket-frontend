import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { logout } = vi.hoisted(() => ({ logout: vi.fn(async () => {}) }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ logout }) }));

import { useIdleLogout } from "@/hooks/use-idle-logout";

describe("useIdleLogout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logout.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("logs out after the timeout with no activity", () => {
    renderHook(() => useIdleLogout(1000, true));
    expect(logout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(logout).toHaveBeenCalledOnce();
  });

  it("resets the countdown on user activity", () => {
    renderHook(() => useIdleLogout(1000, true));
    vi.advanceTimersByTime(900);
    window.dispatchEvent(new Event("mousemove"));
    // 900ms after the reset — still under the 1000ms limit.
    vi.advanceTimersByTime(900);
    expect(logout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(logout).toHaveBeenCalledOnce();
  });

  it("stays dormant when not enabled", () => {
    renderHook(() => useIdleLogout(1000, false));
    vi.advanceTimersByTime(5000);
    expect(logout).not.toHaveBeenCalled();
  });

  it("runs onIdle just before logging out", () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLogout(1000, true, onIdle));
    vi.advanceTimersByTime(1000);
    expect(onIdle).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
  });
});
