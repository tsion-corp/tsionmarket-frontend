import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
let tokens: Array<Record<string, unknown>> = [];
let loading = false;
const refetchFresh = vi.fn(async () => undefined);

vi.mock("@/hooks/use-portfolio", () => ({
  usePortfolio: () => ({ tokens, loading, refetchFresh }),
}));

import { useDepositArrival } from "./use-deposit-arrival";

const usdc = (raw: string) => ({
  network: "base-mainnet",
  address: USDC,
  rawBalance: raw,
  decimals: 6,
});
const input = { network: "base-mainnet", asset: USDC, enabled: true };

beforeEach(() => {
  vi.useFakeTimers();
  tokens = [usdc("1000000")];
  loading = false;
  refetchFresh.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("useDepositArrival", () => {
  it("waits, asking only for the settlement network, until the balance goes up", () => {
    const { result, rerender } = renderHook(() => useDepositArrival(input));
    expect(result.current.state).toBe("waiting");
    act(() => void vi.advanceTimersByTime(8_000));
    expect(refetchFresh).toHaveBeenCalledWith(["base-mainnet"]);

    tokens = [usdc("3827234")];
    rerender();
    expect(result.current).toEqual({ state: "received", raw: 2_827_234n, decimals: 6 });
  });

  it("does not call a still-loading balance a deposit", () => {
    tokens = [];
    loading = true;
    const { result, rerender } = renderHook(() => useDepositArrival(input));
    loading = false;
    tokens = [usdc("1000000")];
    rerender();
    expect(result.current.state).toBe("waiting");
  });

  it("stops asking once received, and gives up after a quarter of an hour", () => {
    const { result, rerender } = renderHook(() => useDepositArrival(input));
    act(() => void vi.advanceTimersByTime(16 * 60_000));
    expect(result.current.state).toBe("stopped");
    const calls = refetchFresh.mock.calls.length;
    act(() => void vi.advanceTimersByTime(60_000));
    rerender();
    expect(refetchFresh.mock.calls.length).toBe(calls);
  });

  it("does nothing until the address is showing", () => {
    renderHook(() => useDepositArrival({ ...input, enabled: false }));
    act(() => void vi.advanceTimersByTime(60_000));
    expect(refetchFresh).not.toHaveBeenCalled();
  });
});
