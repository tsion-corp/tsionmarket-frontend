import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePerpMode } from "@/components/dashboard/trade/perp-mode";

const KEY = "wsws.perp-mode.v1";

// The store is module-level by design (one shared selection app-wide), so these
// tests run as a sequence against that single instance, the same way a session
// would.
describe("usePerpMode", () => {
  it("defaults to simple when nothing is stored", () => {
    window.localStorage.removeItem(KEY);
    const { result } = renderHook(() => usePerpMode());
    expect(result.current.mode).toBe("simple");
  });

  it("persists the choice to localStorage and updates every subscriber", () => {
    const first = renderHook(() => usePerpMode());
    const second = renderHook(() => usePerpMode());
    act(() => first.result.current.setMode("pro"));
    expect(first.result.current.mode).toBe("pro");
    expect(second.result.current.mode).toBe("pro");
    expect(window.localStorage.getItem(KEY)).toBe("pro");
  });

  it("ignores a corrupted stored value and recovers to the default", () => {
    window.localStorage.setItem(KEY, "weird");
    const { result } = renderHook(() => usePerpMode());
    // Hydration rejects the invalid value and settles on the default.
    expect(result.current.mode).toBe("simple");
    expect(window.localStorage.getItem(KEY)).toBe("simple");
  });

  it("restores a valid stored choice on mount", () => {
    window.localStorage.setItem(KEY, "pro");
    const { result } = renderHook(() => usePerpMode());
    expect(result.current.mode).toBe("pro");
  });
});
