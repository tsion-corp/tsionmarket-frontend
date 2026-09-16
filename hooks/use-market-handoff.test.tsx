import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const viewport = vi.hoisted(() => ({ mobile: false }));
vi.mock("@/hooks/use-is-mobile", () => ({ useIsMobile: () => viewport.mobile }));

const { useMarketHandoff } = await import("./use-market-handoff");

beforeEach(() => {
  router.replace.mockClear();
  viewport.mobile = false;
});

describe("useMarketHandoff", () => {
  it("hands a phone off to the matching Market tab and says so", () => {
    viewport.mobile = true;
    const { result } = renderHook(() => useMarketHandoff("rwa"));
    expect(result.current).toBe(true);
    expect(router.replace).toHaveBeenCalledWith("/market?tab=rwa");
  });

  it("leaves a desktop where it is", () => {
    const { result } = renderHook(() => useMarketHandoff("spot"));
    expect(result.current).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
