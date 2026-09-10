import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { saveInterest, clearInterest } from "@/lib/preferences";
import { announceInterestChange, useInterest } from "./use-interest";

afterEach(() => {
  clearInterest();
});

describe("useInterest", () => {
  it("reads the saved interest", () => {
    saveInterest("gold");
    const { result } = renderHook(() => useInterest());
    expect(result.current).toBe("gold");
  });

  it("is null with nothing saved", () => {
    const { result } = renderHook(() => useInterest());
    expect(result.current).toBeNull();
  });

  it("follows a change announced in this tab", () => {
    const { result } = renderHook(() => useInterest());
    act(() => {
      saveInterest("treasuries");
      announceInterestChange();
    });
    expect(result.current).toBe("treasuries");
  });
});
