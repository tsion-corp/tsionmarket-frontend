import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SportsbookOrder } from "@/features/prediction/sportsbook/api";
import type { ShineEvent } from "@/lib/shine/types";

const shine = vi.hoisted(() => ({ reportShine: vi.fn() }));
vi.mock("@/lib/shine", () => ({ reportShine: shine.reportShine }));

import { resetSportsbookShineMemory } from "@/features/prediction/sportsbook/shine";
import { useSportsbookShine } from "@/features/prediction/sportsbook/hooks/use-sportsbook-shine";

function order(over: Partial<SportsbookOrder> = {}): SportsbookOrder {
  return {
    ticketId: "ticket-1",
    bookingCode: "01-ab",
    ownerWallet: "0xowner",
    status: "submitted",
    kind: "ordinary",
    environment: "base",
    stakeAtomic: "1000000",
    possiblePayoutAtomic: "2500000",
    payoutAtomic: null,
    bonusId: null,
    token: { symbol: "WETH", decimals: 18 },
    providerOrderId: null,
    betId: null,
    transactionHash: null,
    errorCode: null,
    errorMessage: null,
    signatureRequired: false,
    expiresAt: null,
    settlement: null,
    legs: [
      {
        eventId: "e1",
        eventTitle: "Arsenal vs Chelsea",
        eventKind: "sports",
        conditionId: "c1",
        marketTitle: "Full time result",
        outcomeId: "o1",
        outcomeTitle: "Arsenal",
        requestedOdds: "2.40",
        acceptedOdds: "2.50",
        result: null,
        index: 0,
      },
    ],
    createdAt: "2026-09-24T00:00:00Z",
    updatedAt: "2026-09-24T00:00:00Z",
    ...over,
  };
}

/** A ticket that settled a minute ago, in the holder's favour. */
function won(over: Partial<SportsbookOrder> = {}): SportsbookOrder {
  const justNow = new Date(Date.now() - 60_000).toISOString();
  return order({
    status: "won",
    payoutAtomic: "2500000",
    updatedAt: justNow,
    settlement: {
      providerStatus: "settled",
      providerResult: "won",
      freebetId: null,
      paymasterContractAddress: null,
      isFreebetAmountReturnable: null,
      isRedeemable: true,
      isRedeemed: false,
      isCashedOut: false,
      hasVoidedLegs: false,
      resolvedAt: justNow,
      syncedAt: justNow,
    },
    ...over,
  });
}

beforeEach(() => {
  shine.reportShine.mockClear();
  resetSportsbookShineMemory();
});

describe("a ticket the sportsbook polls", () => {
  it("reports the acceptance once, when the poll is seen leaving the processing set", () => {
    const view = renderHook((current: SportsbookOrder) => useSportsbookShine(current), {
      initialProps: order({ status: "submitted" }),
    });
    expect(shine.reportShine).not.toHaveBeenCalled();

    view.rerender(order({ status: "accepted" }));
    expect(shine.reportShine).toHaveBeenCalledTimes(1);
    expect(shine.reportShine).toHaveBeenCalledWith({
      service: "sports",
      kind: "placed",
      id: "ticket-1",
      event: "Arsenal vs Chelsea",
      selection: "Arsenal",
      odds: "2.50",
    });

    // A refetch hands back an equal row as a new object. The status has not
    // changed, so there is nothing new to report.
    view.rerender(order({ status: "accepted" }));
    expect(shine.reportShine).toHaveBeenCalledTimes(1);
  });

  it("reports a win once, and not again on a focus refetch or a remount", () => {
    const view = renderHook((current: SportsbookOrder) => useSportsbookShine(current), {
      initialProps: order({ status: "live" }),
    });
    view.rerender(won());

    expect(shine.reportShine).toHaveBeenCalledTimes(1);
    expect(shine.reportShine).toHaveBeenCalledWith({
      service: "sports",
      kind: "won",
      id: "ticket-1:won",
      event: "Arsenal vs Chelsea",
      selection: "Arsenal",
      pnl: "+150%",
    });

    // The window regains focus: useSportsbookOrderHistory refetches and serves
    // the same settled row again, as a new object.
    view.rerender(won());
    expect(shine.reportShine).toHaveBeenCalledTimes(1);

    view.unmount();
    renderHook(() => useSportsbookShine(won()));
    expect(shine.reportShine).toHaveBeenCalledTimes(1);
  });

  it("posts nothing for the settled tickets that were already there when it opened", () => {
    // The first focus after Shine ships: a history of old winning tickets, each
    // under its own id, against a dedup store that has never seen any of them.
    renderHook(() =>
      useSportsbookShine([
        won({ ticketId: "ticket-1" }),
        won({ ticketId: "ticket-2" }),
        won({ ticketId: "ticket-3", status: "redeemed" }),
      ])
    );

    expect(shine.reportShine).not.toHaveBeenCalled();
  });

  it("reports both moments of one ticket under different ids", () => {
    const view = renderHook((current: SportsbookOrder) => useSportsbookShine(current), {
      initialProps: order({ status: "submitted" }),
    });
    view.rerender(order({ status: "accepted" }));
    view.rerender(won());

    const ids = shine.reportShine.mock.calls.map((call) => (call[0] as ShineEvent).id);
    expect(ids).toEqual(["ticket-1", "ticket-1:won"]);
  });

  it("reports nothing for a list it has nothing to say about", () => {
    renderHook(() => useSportsbookShine([]));
    renderHook(() => useSportsbookShine(undefined));
    expect(shine.reportShine).not.toHaveBeenCalled();
  });
});
