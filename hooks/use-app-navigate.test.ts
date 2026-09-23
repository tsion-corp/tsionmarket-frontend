// @vitest-environment jsdom
// This suite renders, so it needs a DOM. vitest.config.ts puts .ts suites in
// the node project to avoid booting jsdom for the many that never touch it;
// the pragma above opts this one back in, per that config's own note.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAppNavigate } from "./use-app-navigate";
import * as scrollModule from "@/lib/scroll";
import { setNavigationGuard } from "@/lib/navigation-guard";

const pushMock = vi.fn();
let currentPathname = "/portfolio";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
  usePathname: () => currentPathname,
}));

describe("useAppNavigate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPathname = "/portfolio";
    setNavigationGuard(null);
  });

  it("navigates to registered section routes", () => {
    const { result } = renderHook(() => useAppNavigate());
    result.current("spot");
    expect(pushMock).toHaveBeenCalledWith("/spot");
  });

  it("scrolls in-page when navigating to portfolio from /portfolio", () => {
    const scrollToSectionSpy = vi
      .spyOn(scrollModule, "scrollToSection")
      .mockImplementation(() => {});
    const { result } = renderHook(() => useAppNavigate());
    result.current("portfolio");
    expect(scrollToSectionSpy).toHaveBeenCalledWith("portfolio");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("navigates to /portfolio from another page", () => {
    currentPathname = "/spot";
    const { result } = renderHook(() => useAppNavigate());
    result.current("portfolio");
    expect(pushMock).toHaveBeenCalledWith("/portfolio");
  });

  it("passes prefill query parameters correctly", () => {
    const { result } = renderHook(() => useAppNavigate());
    result.current("spot", {
      mode: "buy",
      amount: "100",
      symbol: "ETH",
    });
    expect(pushMock).toHaveBeenCalledWith(expect.stringContaining("/spot?trade="));
  });

  it("safely ignores unrecognized nav targets", () => {
    const { result } = renderHook(() => useAppNavigate());
    result.current("unknown-invalid-section");
    expect(pushMock).not.toHaveBeenCalled();
  });

  // A live Last Man round asks before it is left. The desktop sidebar is a row
  // of buttons, not links, so nothing catches that click: this hook is the one
  // place every section button routes through, and the question belongs here.
  describe("the navigation guard", () => {
    it("holds the navigation when a screen takes it over", () => {
      const guard = vi.fn(() => true);
      setNavigationGuard(guard);
      const { result } = renderHook(() => useAppNavigate());
      result.current("spot");
      expect(guard).toHaveBeenCalledWith("/spot");
      expect(pushMock).not.toHaveBeenCalled();
    });

    it("navigates when the guard declines it", () => {
      setNavigationGuard(() => false);
      const { result } = renderHook(() => useAppNavigate());
      result.current("spot");
      expect(pushMock).toHaveBeenCalledWith("/spot");
    });

    it("hands the guard the target including its prefill query", () => {
      const guard = vi.fn(() => true);
      setNavigationGuard(guard);
      const { result } = renderHook(() => useAppNavigate());
      result.current("spot", { mode: "buy", amount: "100", symbol: "ETH" });
      expect(guard).toHaveBeenCalledWith(expect.stringContaining("/spot?trade="));
      expect(pushMock).not.toHaveBeenCalled();
    });

    it("holds an anchor section push too", () => {
      currentPathname = "/spot";
      const guard = vi.fn(() => true);
      setNavigationGuard(guard);
      const { result } = renderHook(() => useAppNavigate());
      result.current("prediction");
      expect(guard).toHaveBeenCalled();
      expect(pushMock).not.toHaveBeenCalled();
    });
  });
});
