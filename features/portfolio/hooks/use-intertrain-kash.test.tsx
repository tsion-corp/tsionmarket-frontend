import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const account = { address: "wsk1abc" as string | null, hasWallet: true, unlocked: true };
const wsk = { data: 2_500_000n as bigint | undefined, isLoading: false, isError: false };
vi.mock("@/hooks/use-intertrain-account", () => ({ useIntertrainAccount: () => account }));
vi.mock("@/hooks/use-wsk-balance", () => ({ useWskBalance: () => wsk }));

import { useIntertrainKash } from "./use-intertrain-kash";

beforeEach(() => {
  account.address = "wsk1abc";
  account.hasWallet = true;
  wsk.data = 2_500_000n;
  wsk.isLoading = false;
  wsk.isError = false;
});

describe("useIntertrainKash", () => {
  it("is off without a new wallet, leaving the legacy engine as it was", () => {
    account.hasWallet = false;
    expect(renderHook(() => useIntertrainKash()).result.current.active).toBe(false);
  });

  it("shows the native WSK balance, one KASH to one WSK", () => {
    const { result } = renderHook(() => useIntertrainKash());
    expect(result.current).toEqual({
      active: true,
      balance: "2.5",
      loading: false,
      unavailable: false,
    });
  });

  it("says unavailable, not zero, while the address is unknown or the node fails", () => {
    account.address = null;
    wsk.data = undefined;
    expect(renderHook(() => useIntertrainKash()).result.current).toMatchObject({
      active: true,
      balance: null,
      unavailable: true,
    });
    account.address = "wsk1abc";
    wsk.isError = true;
    expect(renderHook(() => useIntertrainKash()).result.current.unavailable).toBe(true);
  });

  it("holds the figure's place while the balance is being read", () => {
    wsk.data = undefined;
    wsk.isLoading = true;
    expect(renderHook(() => useIntertrainKash()).result.current).toMatchObject({
      loading: true,
      unavailable: false,
    });
  });
});
