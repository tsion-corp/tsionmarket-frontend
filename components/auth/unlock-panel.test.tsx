// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const kit = vi.hoisted(() => ({
  signInWithPasskey: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithKingsChat: vi.fn(),
  unlockWithPassword: vi.fn(),
}));
const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("decane-connect-kit", () => ({
  useSocialAuth: () => ({
    canUsePasskey: true,
    signInWithPasskey: kit.signInWithPasskey,
    signInWithGoogle: kit.signInWithGoogle,
    signInWithKingsChat: kit.signInWithKingsChat,
  }),
  useSocialWallet: () => ({
    canUnlockWithPassword: () => Promise.resolve(false),
    unlockWithPassword: kit.unlockWithPassword,
  }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/last-auth-method", () => ({
  useLastAuthMethod: () => "passkey",
  rememberPending: vi.fn(),
}));
vi.mock("@/lib/display-profile", () => ({
  useDisplayProfile: () => ({ name: "Korex", email: "korex@example.com" }),
}));
vi.mock("@/lib/analytics/auth-method", () => ({ recordAuthMethod: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast }));
vi.mock("@/lib/decane-recovery", () => ({
  promptUnlockPassword: vi.fn(),
  UnlockPasswordCancelledError: class extends Error {},
}));
vi.mock("@/components/ui/icons", () => ({ UserIcon: () => null }));

import { UnlockPanel } from "@/components/auth/unlock-panel";

function mount() {
  const onPasskeyFailed = vi.fn();
  const onUseAnother = vi.fn();
  render(
    <UnlockPanel
      offer={{ kind: "passkey" }}
      onUseAnother={onUseAnother}
      onPasskeyFailed={onPasskeyFailed}
    />
  );
  return { onPasskeyFailed, onUseAnother };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the passkey shortcut", () => {
  it("keeps the person on the shortcut when the passkey opens a session", async () => {
    kit.signInWithPasskey.mockResolvedValue(undefined);
    const { onPasskeyFailed } = mount();
    fireEvent.click(screen.getByText("unlockWithPasskey"));
    await waitFor(() => expect(kit.signInWithPasskey).toHaveBeenCalled());
    expect(onPasskeyFailed).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("sends them on to their usual way in when the passkey fails, and says why", async () => {
    kit.signInWithPasskey.mockRejectedValue(new Error("no credential"));
    const { onPasskeyFailed, onUseAnother } = mount();
    fireEvent.click(screen.getByText("unlockWithPasskey"));
    await waitFor(() => expect(onPasskeyFailed).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith("passkeyError");
    // Not "use a different account": nothing about the person is forgotten.
    expect(onUseAnother).not.toHaveBeenCalled();
  });

  // The browser answers "not allowed" both for a closed sheet and for a
  // passkey this device does not hold; either way the full list is the
  // next step, with the passkey still one tap away on it.
  it("sends them on quietly when the sheet is closed", async () => {
    const closed = new Error("closed");
    closed.name = "NotAllowedError";
    kit.signInWithPasskey.mockRejectedValue(closed);
    const { onPasskeyFailed } = mount();
    fireEvent.click(screen.getByText("unlockWithPasskey"));
    await waitFor(() => expect(onPasskeyFailed).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
