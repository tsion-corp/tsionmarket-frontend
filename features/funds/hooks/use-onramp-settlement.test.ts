import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOnrampSettlement } from "@/features/funds/hooks/use-onramp-settlement";
import {
  claimOnrampWatch,
  closeOnrampWatch,
  hasOpenOnrampWatch,
  onrampWatches,
  openOnrampWatch,
} from "@/lib/ramping/onramp-watch";
import type { OnrampOrder } from "@/lib/ramping/orders";

const WALLET = "0xaaaa000000000000000000000000000000000001";

const track = vi.hoisted(() => vi.fn());
const useRampOrder = vi.hoisted(() => vi.fn());
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ user: null }) }));
vi.mock("@/lib/user", () => ({ getWalletAddress: () => WALLET }));
vi.mock("@/hooks/use-ramping", () => ({ useRampOrder }));
vi.mock("@/lib/analytics/mixpanel", () => ({ track }));

function order(over: Partial<OnrampOrder>): OnrampOrder {
  return {
    id: "order-1",
    status: "awaiting",
    rawStatus: "",
    rate: "1450",
    paymentAccount: null,
    amountNgn: null,
    amountUsdc: null,
    error: null,
    expiresAt: null,
    ...over,
  };
}

function railSays(data: OnrampOrder | undefined): void {
  useRampOrder.mockReturnValue({ data });
}

function openDeposit(): void {
  openOnrampWatch(
    {
      wallet: WALLET,
      orderId: "order-1",
      reused: false,
      expectedNgn: 5000,
      quotedRate: 1450,
      bank: "Rubies MFB",
    },
    Date.now()
  );
}

beforeEach(() => {
  track.mockClear();
  useRampOrder.mockReset();
  railSays(undefined);
});

// The store caches what it parsed, so it is drained through its own API rather
// than by clearing storage underneath it.
afterEach(() => {
  for (const w of onrampWatches()) closeOnrampWatch(w.orderId, Date.now());
});

describe("following a bank deposit to settlement", () => {
  it("records what the rail says it moved, so the arrival can be described", () => {
    openDeposit();
    railSays(order({ status: "completed", amountNgn: "5000", amountUsdc: "3.448275" }));
    renderHook(() => useOnrampSettlement());

    // The rail's own figures, not the ₦5,000 the user typed at it.
    expect(claimOnrampWatch(WALLET, 3.448275, Date.now())?.amount_ngn).toBe(5000);
    expect(track).not.toHaveBeenCalled();
  });

  it("reports a rejected transfer as a failed deposit, on the right rail", () => {
    openDeposit();
    railSays(order({ status: "failed", error: "beneficiary declined" }));
    renderHook(() => useOnrampSettlement());

    expect(track).toHaveBeenCalledWith("deposit_failed", {
      method: "bank",
      reason: "rail_rejected",
    });
  });

  it("reports that failure once, however often the poll comes back", () => {
    openDeposit();
    railSays(order({ status: "failed" }));
    const { rerender } = renderHook(() => useOnrampSettlement());
    rerender();
    rerender();

    expect(track).toHaveBeenCalledTimes(1);
  });

  it("drops a rejected transfer, so it stops holding later arrivals back", () => {
    openDeposit();
    railSays(order({ status: "failed" }));
    renderHook(() => useOnrampSettlement());

    expect(hasOpenOnrampWatch(WALLET, Date.now())).toBe(false);
  });

  it("says nothing when only the rate lock lapsed", () => {
    // Expired is not failure: the account stays payable and a transfer made
    // after the lock still lands, at the live rate. Counting it as a failed
    // deposit would make every abandoned quote look like a broken rail.
    openDeposit();
    railSays(order({ status: "expired" }));
    renderHook(() => useOnrampSettlement());

    expect(track).not.toHaveBeenCalled();
    expect(hasOpenOnrampWatch(WALLET, Date.now())).toBe(true);
  });

  it("leaves a reused account alone, having no order it can poll", () => {
    openOnrampWatch(
      {
        wallet: WALLET,
        orderId: "reused-1",
        reused: true,
        expectedNgn: 5000,
        quotedRate: 1450,
        bank: "Rubies MFB",
      },
      Date.now()
    );
    railSays(undefined);
    renderHook(() => useOnrampSettlement());

    // Its order completed on an earlier deposit; polling it would report that
    // old settlement as this one.
    expect(useRampOrder).toHaveBeenCalledWith(
      "onramp",
      null,
      expect.objectContaining({
        enabled: false,
      })
    );
  });
});
