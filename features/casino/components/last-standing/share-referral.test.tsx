import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// The point of the whole change (kash ADR-0015): a link shared out of the app
// earns for whoever shared it. The helper and the middleware are tested on
// their own; this proves the game's own share actually uses them.

const { referralCode } = vi.hoisted(() => ({ referralCode: { value: null as string | null } }));

vi.mock("@/hooks/use-referral-code", () => ({ useReferralCode: () => referralCode.value }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/site-url", () => ({
  CANONICAL_SITE_URL: "https://tsionark.com",
  shareOrigin: () => "https://tsionark.com",
}));
vi.mock("@/lib/clipboard", () => ({ copyText: vi.fn(async () => true) }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { useGameShare } from "@/features/casino/components/last-standing/share-game";

describe("a shared Last Man round", () => {
  it("carries the sharer's referral code", () => {
    referralCode.value = "7k4m9x2p";
    const { result } = renderHook(() => useGameShare(274));

    expect(result.current.url).toBe("https://tsionark.com/casino/last-standing/274?ref=7k4m9x2p");
  });

  it("carries a username just as readily", () => {
    referralCode.value = "adaeze";
    const { result } = renderHook(() => useGameShare(274));

    expect(result.current.url).toBe("https://tsionark.com/casino/last-standing/274?ref=adaeze");
  });

  // Signed out, or before the read lands. The link still has to work.
  it("is the plain link when there is no code yet", () => {
    referralCode.value = null;
    const { result } = renderHook(() => useGameShare(274));

    expect(result.current.url).toBe("https://tsionark.com/casino/last-standing/274");
  });
});
