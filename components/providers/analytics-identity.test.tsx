// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Who Mixpanel thinks the person is. Three things go wrong without care here:
// a signup sent before the wallet exists is anonymous and lands on nobody; a
// shared device keeps the last person's identity after their session ends; and
// on-chain data, which is lowercase, cannot be joined to a checksummed id.

const CHECKSUMMED = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";

const privy = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  user: null as unknown,
  onComplete: null as null | ((args: Record<string, unknown>) => void),
}));
vi.mock("@privy-io/react-auth", () => ({
  usePrivy: () => ({ ready: privy.ready, authenticated: privy.authenticated, user: privy.user }),
  useLogin: ({ onComplete }: { onComplete: (args: Record<string, unknown>) => void }) => {
    privy.onComplete = onComplete;
  },
}));

// One ordered log across every analytics call, so the tests can say which
// happened first.
const calls = vi.hoisted(() => [] as string[]);
const analytics = vi.hoisted(() => ({
  identifyUser: vi.fn((id: string) => calls.push(`identify:${id}`)),
  resetAnalytics: vi.fn(() => calls.push("reset")),
  resetStaleIdentity: vi.fn(() => calls.push("resetStale")),
  setProfileOnce: vi.fn(),
  setSuper: vi.fn(),
  track: vi.fn((name: string) => calls.push(`track:${name}`)),
}));
vi.mock("@/lib/analytics/mixpanel", () => analytics);
vi.mock("@/lib/analytics/clarity", () => ({
  identifyClarity: vi.fn(async () => {}),
  tagClaritySession: vi.fn(async () => {}),
}));

import { AnalyticsIdentity } from "@/components/providers/analytics-identity";

function userWithWallet(address: string | null) {
  return {
    id: "did:privy:u1",
    email: { address: "a@b.co" },
    linkedAccounts: address
      ? [{ type: "wallet", walletClientType: "privy", chainType: "ethereum", address }]
      : [],
  };
}

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  privy.ready = true;
  privy.authenticated = false;
  privy.user = null;
});

describe("AnalyticsIdentity", () => {
  it("sends a new account's signup only once it has been identified", () => {
    // Privy finishes the login before the embedded wallet exists.
    privy.authenticated = true;
    privy.user = userWithWallet(null);
    const view = renderHook(() => AnalyticsIdentity());
    privy.onComplete!({ isNewUser: true, loginMethod: "google", wasAlreadyAuthenticated: false });
    expect(calls).not.toContain("track:signup_completed");

    // The wallet arrives on a later render.
    privy.user = userWithWallet(CHECKSUMMED);
    view.rerender();

    expect(calls.indexOf(`identify:${CHECKSUMMED}`)).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("track:signup_completed")).toBeGreaterThan(
      calls.indexOf(`identify:${CHECKSUMMED}`)
    );
    expect(analytics.track).toHaveBeenCalledWith("signup_completed", { method: "google" });
  });

  it("sends a login straight away when the account is already identified", () => {
    privy.authenticated = true;
    privy.user = userWithWallet(CHECKSUMMED);
    renderHook(() => AnalyticsIdentity());
    privy.onComplete!({ isNewUser: false, loginMethod: "email", wasAlreadyAuthenticated: false });

    expect(analytics.track).toHaveBeenCalledWith("login_completed", { method: "email" });
  });

  it("identifies by the address as Privy gives it, and adds it lowercase for joins", () => {
    // Every existing Mixpanel profile is keyed by the checksummed address, so
    // changing the id would split each person in two.
    privy.authenticated = true;
    privy.user = userWithWallet(CHECKSUMMED);
    renderHook(() => AnalyticsIdentity());

    expect(analytics.identifyUser).toHaveBeenCalledWith(CHECKSUMMED, expect.anything());
    expect(analytics.setSuper).toHaveBeenCalledWith(
      expect.objectContaining({ wallet_evm: CHECKSUMMED.toLowerCase() })
    );
  });

  it("clears a previous person's identity when this visit has no session", () => {
    // A session that ended while the tab was closed (the idle sign-out) never
    // passed through a logout here, so nothing reset the device.
    renderHook(() => AnalyticsIdentity());
    expect(analytics.resetStaleIdentity).toHaveBeenCalledTimes(1);
  });

  it("does nothing about identity until Privy knows whether there is a session", () => {
    privy.ready = false;
    renderHook(() => AnalyticsIdentity());
    expect(analytics.resetStaleIdentity).not.toHaveBeenCalled();
    expect(analytics.identifyUser).not.toHaveBeenCalled();
  });
});
