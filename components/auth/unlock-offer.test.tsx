// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const kit = vi.hoisted(() => ({
  canUsePasskey: false,
  password: Promise.resolve(false) as Promise<boolean>,
}));
const device = vi.hoisted(() => ({
  last: null as string | null,
  profile: null as { name?: string; email?: string } | null,
}));

vi.mock("decane-connect-kit", () => ({
  useSocialAuth: () => ({ canUsePasskey: kit.canUsePasskey }),
  useSocialWallet: () => ({ canUnlockWithPassword: () => kit.password }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/last-auth-method", () => ({
  useLastAuthMethod: () => device.last,
  rememberPending: vi.fn(),
}));
vi.mock("@/lib/display-profile", () => ({
  useDisplayProfile: () => device.profile,
}));
vi.mock("@/lib/analytics/auth-method", () => ({ recordAuthMethod: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/decane-recovery", () => ({
  promptUnlockPassword: vi.fn(),
  UnlockPasswordCancelledError: class extends Error {},
}));
vi.mock("@/components/ui/icons", () => ({ UserIcon: () => null }));

import { useUnlockOffer } from "@/components/auth/unlock-panel";

beforeEach(() => {
  kit.canUsePasskey = false;
  kit.password = Promise.resolve(false);
  device.last = null;
  device.profile = null;
});

describe("useUnlockOffer", () => {
  // The screen after a sign-out: the device answers asynchronously, and until
  // it does the offer is "not yet", never "no" — the auth page holds the
  // method list back for a remembered visitor on this flag.
  it("reports checking until the device has answered, then offers the password", async () => {
    let answer!: (can: boolean) => void;
    kit.password = new Promise<boolean>((resolve) => {
      answer = resolve;
    });
    const { result } = renderHook(() => useUnlockOffer());
    expect(result.current).toEqual({ offer: null, checking: true });
    answer(true);
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.offer).toEqual({ kind: "password" });
  });

  it("offers the passkey at once, and it outranks the password", async () => {
    kit.canUsePasskey = true;
    kit.password = Promise.resolve(true);
    const { result } = renderHook(() => useUnlockOffer());
    expect(result.current).toEqual({ offer: { kind: "passkey" }, checking: false });
  });

  it("settles to the full list when the device holds nothing and nobody is remembered", async () => {
    const { result } = renderHook(() => useUnlockOffer());
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.offer).toBeNull();
  });

  // The one-tap repeat needs a name to put on the button. It survives sign-out
  // now that sign-out keeps the profile; "use a different account" clears it.
  it("offers a one-tap Google repeat for a remembered visitor with no device secret", async () => {
    device.profile = { name: "Kore" };
    device.last = "google";
    const { result } = renderHook(() => useUnlockOffer());
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.offer).toEqual({ kind: "google" });
  });

  it("offers nothing for an unnamed visitor even with a last method", async () => {
    device.last = "google";
    const { result } = renderHook(() => useUnlockOffer());
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.offer).toBeNull();
  });

  it("treats a failed password check as no password, not as forever checking", async () => {
    kit.password = Promise.reject(new Error("store unavailable"));
    const { result } = renderHook(() => useUnlockOffer());
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.offer).toBeNull();
  });
});
