import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDepositAnalytics } from "@/features/activity/hooks/use-deposit-analytics";
import { closeOnrampWatch, openOnrampWatch } from "@/lib/ramping/onramp-watch";
import type { ActivityItem } from "@/lib/server/activity";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/mixpanel", () => ({ track }));

const WALLET = "0xaaaa000000000000000000000000000000000001";
const SEEN_KEY = "wsws.analytics.reported-deposits.v1";

function item(over: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: "0xabc:log:1",
    hash: "0xabc",
    network: "base-mainnet",
    direction: "in",
    symbol: "USDC",
    amount: 3.448275,
    timestamp: 1_000,
    counterparty: null,
    logo: null,
    ...over,
  };
}

// A device that has reported before, so the run under test is not the silent
// seeding pass.
function alreadySeeded(): void {
  window.localStorage.setItem(SEEN_KEY, JSON.stringify(["0xold:log:0"]));
}

function openBankDeposit(expectedNgn: number): void {
  openOnrampWatch(
    {
      wallet: WALLET,
      orderId: "order-1",
      reused: true,
      expectedNgn,
      quotedRate: 1450,
      provider: "Rubies MFB",
    },
    Date.now()
  );
}

beforeEach(() => {
  window.localStorage.clear();
  track.mockClear();
});

describe("reporting a settled deposit", () => {
  it("records what is already there on a device's first run, silently", () => {
    // Otherwise a returning user's whole history arrives in Mixpanel as
    // deposits that happened today.
    renderHook(() => useDepositAnalytics([item()], WALLET));
    expect(track).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SEEN_KEY)).toContain("0xabc:log:1");
  });

  it("names the chain rail when no bank transfer explains the arrival", () => {
    alreadySeeded();
    renderHook(() => useDepositAnalytics([item()], WALLET));
    expect(track).toHaveBeenCalledWith("deposit_completed", {
      method: "crypto",
      source_network: "base-mainnet",
      amount_usd: 3.448275,
    });
  });

  it("sends no Naira properties on a chain deposit", () => {
    alreadySeeded();
    renderHook(() => useDepositAnalytics([item()], WALLET));
    const [, props] = track.mock.calls.at(-1) as [string, Record<string, unknown>];
    expect(props).not.toHaveProperty("amount_ngn");
    expect(props).not.toHaveProperty("fx_rate");
    expect(props).not.toHaveProperty("bank");
  });

  it("names the bank rail when a transfer this device started explains it", () => {
    // The same arrival, on the same network, for the same dollars. Only the
    // open transfer tells the two apart.
    alreadySeeded();
    openBankDeposit(5000);
    renderHook(() => useDepositAnalytics([item()], WALLET));
    expect(track).toHaveBeenCalledWith("deposit_completed", {
      method: "bank",
      amount_usd: 3.448275,
      amount_ngn: 5000,
      fx_rate: 1450,
      provider: "Rubies MFB",
    });
  });

  it("reports one event for a Naira deposit, not one per rail", () => {
    alreadySeeded();
    openBankDeposit(5000);
    renderHook(() => useDepositAnalytics([item()], WALLET));
    expect(track).toHaveBeenCalledTimes(1);
  });

  it("holds an arrival back rather than guessing while a transfer is open", () => {
    // 50,000 Naira is nothing like this arrival, so it is not the match. It is
    // also not proof the arrival is a chain deposit: the rail may not have
    // reported the real figures yet, and a wrong rail cannot be taken back.
    alreadySeeded();
    openBankDeposit(50000);
    const { rerender } = renderHook(({ items }) => useDepositAnalytics(items, WALLET), {
      initialProps: { items: [item()] },
    });
    expect(track).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SEEN_KEY)).not.toContain("0xabc:log:1");

    // Once nothing is in flight the same arrival is reported as what it is.
    closeOnrampWatch("order-1", Date.now());
    rerender({ items: [item()] });
    expect(track).toHaveBeenCalledWith(
      "deposit_completed",
      expect.objectContaining({ method: "crypto" })
    );
  });
});
