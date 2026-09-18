// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ActivityItem } from "@/lib/server/activity";

const refetchFresh = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-portfolio", () => ({ usePortfolio: () => ({ refetchFresh }) }));

import { useDepositBalanceRefresh } from "@/features/activity/hooks/use-deposit-balance-refresh";

const WALLET = "0xaaaa000000000000000000000000000000000001";
const SEEN_KEY = "wsws.balance.deposit-seen.v1";

function item(over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: "0xabc:log:1",
    hash: "0xabc",
    network: "base-mainnet",
    direction: "in",
    symbol: "USDC",
    amount: 12.5,
    timestamp: 1_000,
    counterparty: null,
    logo: null,
    ...over,
  };
}

// A device that has recorded arrivals before, so the run under test is not the
// silent seeding pass.
function alreadySeeded(): void {
  window.localStorage.setItem(SEEN_KEY, JSON.stringify(["0xold:log:0"]));
}

beforeEach(() => {
  window.localStorage.clear();
  refetchFresh.mockClear();
});

describe("useDepositBalanceRefresh", () => {
  it("seeds a device's first run without refreshing", () => {
    // Those arrivals are already in the balance on screen; re-reading the whole
    // history is the polling this change exists to remove.
    renderHook(() => useDepositBalanceRefresh([item()], WALLET));
    expect(refetchFresh).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SEEN_KEY)).toContain("0xabc:log:1");
  });

  it("refreshes only the arrival's network on a genuinely new deposit", () => {
    alreadySeeded();
    renderHook(() => useDepositBalanceRefresh([item()], WALLET));
    expect(refetchFresh).toHaveBeenCalledWith(["base-mainnet"]);
  });

  it("does nothing when every arrival has already been accounted for", () => {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(["0xabc:log:1"]));
    renderHook(() => useDepositBalanceRefresh([item()], WALLET));
    expect(refetchFresh).not.toHaveBeenCalled();
  });

  it("ignores an outbound transfer, which is not a deposit", () => {
    alreadySeeded();
    renderHook(() => useDepositBalanceRefresh([item({ direction: "out" })], WALLET));
    expect(refetchFresh).not.toHaveBeenCalled();
  });

  it("does not refresh before a wallet is known", () => {
    alreadySeeded();
    renderHook(() => useDepositBalanceRefresh([item()], ""));
    expect(refetchFresh).not.toHaveBeenCalled();
  });
});
