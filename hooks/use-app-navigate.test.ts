// @vitest-environment jsdom
// This suite renders, so it needs a DOM. vitest.config.ts puts .ts suites in
// the node project to avoid booting jsdom for the many that never touch it;
// the pragma above opts this one back in, per that config's own note.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAppNavigate } from "./use-app-navigate";
import * as scrollModule from "@/lib/scroll";

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
});
