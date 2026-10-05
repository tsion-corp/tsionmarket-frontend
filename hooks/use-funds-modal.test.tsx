import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.hoisted(() => ({ signedIn: true, asked: [] as string[] }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-require-session", () => ({
  useRequireSession: () => (action: string) => {
    if (gate.signedIn) return true;
    gate.asked.push(action);
    return false;
  },
}));

import {
  closeFundsModal,
  useAddFunds,
  useAddFundsAction,
  useFundsModalOpen,
} from "@/hooks/use-funds-modal";

describe("useAddFunds", () => {
  beforeEach(() => {
    act(() => closeFundsModal());
    gate.signedIn = true;
    gate.asked = [];
  });

  it("opens the deposit modal for a signed-in user", () => {
    const open = renderHook(() => useFundsModalOpen());
    const { result } = renderHook(() => useAddFunds());
    act(() => result.current());
    expect(open.result.current).toBe(true);
  });

  it("asks a signed-out visitor to sign in and opens nothing", () => {
    gate.signedIn = false;
    const open = renderHook(() => useFundsModalOpen());
    const { result } = renderHook(() => useAddFunds());
    act(() => result.current());
    expect(open.result.current).toBe(false);
    expect(gate.asked).toEqual(["fund"]);
  });

  it("gives a toast an Add funds button that opens the modal", () => {
    const open = renderHook(() => useFundsModalOpen());
    const { result } = renderHook(() => useAddFundsAction());
    expect(result.current.label).toBe("addFunds");
    act(() => result.current.onClick());
    expect(open.result.current).toBe(true);
  });
});
