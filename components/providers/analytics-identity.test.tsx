// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAuthMethod } from "@/lib/analytics/auth-method";

// Who Mixpanel thinks the person is. Three things go wrong without care here:
// a signup sent before the wallet exists is anonymous and lands on nobody; a
// shared device keeps the last person's identity after their session ends; and
// on-chain data, which is lowercase, cannot be joined to a checksummed id.

const CHECKSUMMED = "0xAbCdEf0123456789aBcDeF0123456789AbCdEf01";

const session = vi.hoisted(() => ({
  ready: true,
  authenticated: false,
  evmAddress: null as string | null,
  isNewUser: false,
}));
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: session.ready,
    authenticated: session.authenticated,
    evmAddress: session.evmAddress,
    solanaAddress: null,
    profile: { name: "Ada", email: "a@b.co", avatarSeed: "ada" },
    logout: vi.fn(),
  }),
}));
vi.mock("decane-connect-kit", () => ({
  useSocialAuth: () => ({ isNewUser: session.isNewUser }),
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

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  session.ready = true;
  session.authenticated = false;
  session.evmAddress = null;
  session.isNewUser = false;
});

describe("AnalyticsIdentity", () => {
  it("sends a new account's signup only once it has been identified", () => {
    // The sign-in completes (the auth component records its method) before
    // the embedded wallet exists.
    recordAuthMethod("google");
    session.authenticated = true;
    session.isNewUser = true;
    const view = renderHook(() => AnalyticsIdentity());
    expect(calls).not.toContain("track:signup_completed");

    // The wallet arrives on a later render.
    session.evmAddress = CHECKSUMMED;
    view.rerender();

    expect(calls.indexOf(`identify:${CHECKSUMMED}`)).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("track:signup_completed")).toBeGreaterThan(
      calls.indexOf(`identify:${CHECKSUMMED}`)
    );
    expect(analytics.track).toHaveBeenCalledWith("signup_completed", { method: "google" });
  });

  it("sends a login straight away when the account is already identified", () => {
    recordAuthMethod("email");
    session.authenticated = true;
    session.evmAddress = CHECKSUMMED;
    renderHook(() => AnalyticsIdentity());

    expect(analytics.track).toHaveBeenCalledWith("login_completed", { method: "email" });
  });

  it("sends no login for a session that merely hydrated", () => {
    // Nothing recorded a method: this is a returning visitor, not a sign-in.
    session.authenticated = true;
    session.evmAddress = CHECKSUMMED;
    renderHook(() => AnalyticsIdentity());

    expect(analytics.identifyUser).toHaveBeenCalledTimes(1);
    expect(analytics.track).not.toHaveBeenCalled();
  });

  it("identifies by the address as the session gives it, and adds it lowercase for joins", () => {
    // Every existing Mixpanel profile is keyed by the checksummed address, so
    // changing the id would split each person in two.
    session.authenticated = true;
    session.evmAddress = CHECKSUMMED;
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

  it("does nothing about identity until the session knows whether it is signed in", () => {
    session.ready = false;
    renderHook(() => AnalyticsIdentity());
    expect(analytics.resetStaleIdentity).not.toHaveBeenCalled();
    expect(analytics.identifyUser).not.toHaveBeenCalled();
  });
});
