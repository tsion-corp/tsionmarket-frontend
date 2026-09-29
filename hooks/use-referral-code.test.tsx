import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { session, fetchMyReferral } = vi.hoisted(() => ({
  session: { ready: true, authenticated: true, evmAddress: "0xabc" as string | null },
  fetchMyReferral: vi.fn(),
}));

vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));
vi.mock("@/lib/referral-me", () => ({
  fetchMyReferral,
  MY_REFERRAL_KEY: (wallet: string | null) => ["referrals", "me", wallet],
}));

import { useReferralCode } from "@/hooks/use-referral-code";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const render = () => renderHook(() => useReferralCode(), { wrapper });

describe("the code a share link should carry", () => {
  // /r/adaeze is worth more than /r/7k4m9x2p, and both resolve to one wallet.
  it("prefers the username when the wallet has one", async () => {
    fetchMyReferral.mockResolvedValue({ username: "adaeze", refCode: "7k4m9x2p" });
    const { result } = render();
    await waitFor(() => expect(result.current).toBe("adaeze"));
  });

  it("falls back to the given code when no name was claimed", async () => {
    fetchMyReferral.mockResolvedValue({ username: null, refCode: "7k4m9x2p" });
    const { result } = render();
    await waitFor(() => expect(result.current).toBe("7k4m9x2p"));
  });

  // An engine that predates ADR-0015 sends neither. The link still has to work,
  // so callers get null and withReferral leaves the url alone.
  it("is null when the engine sends neither", async () => {
    fetchMyReferral.mockResolvedValue({ username: null, refCode: null });
    const { result } = render();
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("is null before the read lands", () => {
    fetchMyReferral.mockReturnValue(new Promise(() => {}));
    expect(render().result.current).toBeNull();
  });

  it("asks for nothing while signed out", () => {
    session.authenticated = false;
    fetchMyReferral.mockClear();
    expect(render().result.current).toBeNull();
    expect(fetchMyReferral).not.toHaveBeenCalled();
    session.authenticated = true;
  });
});
