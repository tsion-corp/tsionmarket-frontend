import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ ready: true, authenticated: false }));
vi.mock("@/hooks/use-auth-session", () => ({ useAuthSession: () => session }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const toast = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast }));

import { useRequireSession, useSignInPrompt } from "@/hooks/use-require-session";
import { closeSignIn, useSignInOpen } from "@/hooks/use-sign-in";

describe("useRequireSession", () => {
  beforeEach(() => {
    toast.info.mockReset();
    closeSignIn();
    session.ready = true;
    session.authenticated = false;
  });

  it("lets a signed-in visitor act, quietly", () => {
    session.authenticated = true;
    const { result } = renderHook(() => useRequireSession());
    expect(result.current("play")).toBe(true);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("stops a signed-out visitor and says why, with a Sign in button", () => {
    const { result } = renderHook(() => useRequireSession());
    expect(result.current("buy")).toBe(false);
    expect(toast.info).toHaveBeenCalledTimes(1);
    const [message, options] = toast.info.mock.calls[0];
    expect(message).toBe("gate.buy");
    expect(options.action.label).toBe("signIn");
  });

  it("opens the sign-in modal from the toast's button", () => {
    const { result } = renderHook(() => useRequireSession());
    result.current("bet");
    const open = renderHook(() => useSignInOpen());
    expect(open.result.current).toBe(false);
    toast.info.mock.calls[0][1].action.onClick();
    open.rerender();
    expect(open.result.current).toBe(true);
  });

  it("treats a session that has not answered yet as signed out", () => {
    session.ready = false;
    session.authenticated = true;
    const { result } = renderHook(() => useRequireSession());
    expect(result.current("fund")).toBe(false);
  });
});

describe("useSignInPrompt", () => {
  beforeEach(() => {
    toast.info.mockReset();
    closeSignIn();
    session.ready = true;
    session.authenticated = false;
  });

  it("toasts a signed-out visitor without opening the modal", () => {
    const { result } = renderHook(() => useSignInPrompt("play"));
    const open = renderHook(() => useSignInOpen());
    result.current();
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info.mock.calls[0][0]).toBe("gate.play");
    expect(open.result.current).toBe(false);
  });

  it("opens the modal for a signed-in visitor whose wallet is not ready", () => {
    session.authenticated = true;
    const { result } = renderHook(() => useSignInPrompt("bet"));
    const open = renderHook(() => useSignInOpen());
    act(() => result.current());
    expect(toast.info).not.toHaveBeenCalled();
    expect(open.result.current).toBe(true);
  });
});
