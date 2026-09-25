// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOfframpSettlement } from "@/features/funds/hooks/use-offramp-settlement";
import { offrampWatches, openOfframpWatch } from "@/lib/ramping/offramp-watch";
import { insertIdFor } from "@/lib/analytics/insert-id";
import type { OfframpOrder } from "@/lib/ramping/orders";

// A bank withdrawal used to count only if its screen was still open when the
// payout completed. The order is remembered when it is created, and followed
// from every signed-in page until the rail says how it ended.

const WALLET = "0xaaaa000000000000000000000000000000000001";

const track = vi.hoisted(() => vi.fn());
const useRampOrder = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-auth-session", () => ({
  useAuthSession: () => ({
    ready: true,
    authenticated: true,
    evmAddress: WALLET,
    solanaAddress: null,
    userId: "u-1",
    profile: { name: "u", email: "", avatarSeed: "u" },
    logout: async () => {},
  }),
}));
vi.mock("@/hooks/use-ramping", () => ({ useRampOrder }));
vi.mock("@/lib/analytics/mixpanel", () => ({ track }));

function order(over: Partial<OfframpOrder>): OfframpOrder {
  return {
    id: "off-1",
    status: "awaiting",
    rawStatus: "",
    rate: "1372",
    depositAddress: null,
    recipientName: null,
    amountNgn: null,
    amountUsdc: null,
    error: null,
    expiresAt: null,
    ...over,
  };
}

function openWithdrawal(): void {
  openOfframpWatch(
    { wallet: WALLET, orderId: "off-1", bank: "OPay Digital Services", amountUsd: 104.62 },
    Date.now()
  );
}

beforeEach(() => {
  window.localStorage.clear();
  track.mockClear();
  useRampOrder.mockReset();
  useRampOrder.mockReturnValue({ data: undefined });
});

describe("useOfframpSettlement", () => {
  it("reports a completed payout from the rail's own figures, once, and forgets it", () => {
    openWithdrawal();
    useRampOrder.mockReturnValue({
      data: order({ status: "completed", amountUsdc: "104.62", amountNgn: "143538.64" }),
    });
    const view = renderHook(() => useOfframpSettlement());
    view.rerender();

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("withdraw_completed", {
      method: "bank",
      asset: "USDC",
      amount_usd: 104.62,
      amount_ngn: 143538.64,
      fx_rate: 1372,
      bank: "OPay Digital Services",
      order_id: "off-1",
      $insert_id: insertIdFor("withdraw_completed", "off-1"),
    });
    expect(offrampWatches()).toEqual([]);
  });

  it("reports a payout the rail could not deliver", () => {
    openWithdrawal();
    useRampOrder.mockReturnValue({ data: order({ status: "failed" }) });
    renderHook(() => useOfframpSettlement());

    expect(track).toHaveBeenCalledWith("withdraw_failed", {
      method: "bank",
      reason: "rail_rejected",
      amount_usd: 104.62,
      order_id: "off-1",
    });
    expect(offrampWatches()).toEqual([]);
  });

  it("waits for the rail's figures rather than reporting a guessed payout", () => {
    openWithdrawal();
    useRampOrder.mockReturnValue({ data: order({ status: "completed", rate: "" }) });
    renderHook(() => useOfframpSettlement());

    expect(track).not.toHaveBeenCalled();
    expect(offrampWatches()).toHaveLength(1);
  });
});
