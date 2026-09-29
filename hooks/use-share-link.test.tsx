import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { code } = vi.hoisted(() => ({ code: { value: null as string | null } }));
vi.mock("@/hooks/use-referral-code", () => ({ useReferralCode: () => code.value }));

import { useShareLink } from "@/hooks/use-share-link";

describe("the app's shared links", () => {
  it("carry the sharer's code", () => {
    code.value = "7k4m9x2p";
    const { result } = renderHook(() => useShareLink());
    expect(result.current("https://tsionark.com/prediction/9")).toBe(
      "https://tsionark.com/prediction/9?ref=7k4m9x2p"
    );
  });

  it("keep a query the link already had", () => {
    code.value = "7k4m9x2p";
    const { result } = renderHook(() => useShareLink());
    expect(result.current("https://tsionark.com/casino/chess/invite?code=abc")).toBe(
      "https://tsionark.com/casino/chess/invite?code=abc&ref=7k4m9x2p"
    );
  });

  // Signed out, or before the read lands. The link still has to work.
  it("are handed back untouched when there is no code", () => {
    code.value = null;
    const { result } = renderHook(() => useShareLink());
    expect(result.current("https://tsionark.com/spot")).toBe("https://tsionark.com/spot");
  });
});
