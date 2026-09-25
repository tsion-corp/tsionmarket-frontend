import { beforeEach, describe, expect, it } from "vitest";
import type { SportsbookOrder } from "@/features/prediction/sportsbook/api";
import {
  observeSportsbookOrder,
  resetSportsbookShineMemory,
  settledRecently,
  SHINE_SETTLEMENT_MAX_AGE_MS,
  sportsbookPlacedEvent,
  sportsbookWonEvent,
} from "@/features/prediction/sportsbook/shine";

const NOW = Date.parse("2026-09-24T12:00:00Z");

const SETTLED: NonNullable<SportsbookOrder["settlement"]> = {
  providerStatus: "settled",
  providerResult: "won",
  freebetId: null,
  paymasterContractAddress: null,
  isFreebetAmountReturnable: null,
  isRedeemable: true,
  isRedeemed: false,
  isCashedOut: false,
  hasVoidedLegs: false,
  resolvedAt: new Date(NOW - 60_000).toISOString(),
  syncedAt: new Date(NOW - 60_000).toISOString(),
};

function leg(over: Partial<SportsbookOrder["legs"][number]> = {}): SportsbookOrder["legs"][number] {
  return {
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
    ...over,
  };
}

function order(over: Partial<SportsbookOrder> = {}): SportsbookOrder {
  return {
    ticketId: "ticket-1",
    bookingCode: "01-ab",
    ownerWallet: "0xowner",
    status: "accepted",
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
    legs: [leg()],
    createdAt: "2026-09-24T00:00:00Z",
    updatedAt: "2026-09-24T00:00:00Z",
    ...over,
  };
}

/** A ticket that has just settled in the holder's favour. */
function won(over: Partial<SportsbookOrder> = {}): SportsbookOrder {
  return order({
    status: "won",
    payoutAtomic: "2500000",
    settlement: SETTLED,
    updatedAt: new Date(NOW - 60_000).toISOString(),
    ...over,
  });
}

beforeEach(() => {
  resetSportsbookShineMemory();
});

describe("the event an accepted ticket warrants", () => {
  it("names the fixture, the selection and the odds that were accepted", () => {
    expect(sportsbookPlacedEvent(order())).toEqual({
      service: "sports",
      kind: "placed",
      id: "ticket-1",
      event: "Arsenal vs Chelsea",
      selection: "Arsenal",
      odds: "2.50",
    });
  });

  it("falls back to the requested odds when none were accepted yet", () => {
    expect(sportsbookPlacedEvent(order({ legs: [leg({ acceptedOdds: null })] }))?.odds).toBe(
      "2.40"
    );
  });

  it("states no odds for a combo, which has no total the ticket reports", () => {
    const combo = order({
      kind: "combo",
      legs: [leg(), leg({ eventTitle: "Spurs vs City", outcomeTitle: "Over 2.5", index: 1 })],
    });
    expect(sportsbookPlacedEvent(combo)).toEqual({
      service: "sports",
      kind: "placed",
      id: "ticket-1",
      event: "Arsenal vs Chelsea + Spurs vs City",
      selection: "Arsenal, Over 2.5",
      odds: null,
    });
  });

  it("reports nothing for a ticket with no selections on it", () => {
    expect(sportsbookPlacedEvent(order({ legs: [] }))).toBeNull();
  });
});

describe("the event a won ticket warrants", () => {
  it("states the return on the stake, computed in base units", () => {
    const ticket = order({ status: "won", payoutAtomic: "2500000" });
    expect(sportsbookWonEvent(ticket)).toEqual({
      service: "sports",
      kind: "won",
      id: "ticket-1:won",
      event: "Arsenal vs Chelsea",
      selection: "Arsenal",
      pnl: "+150%",
    });
  });

  it("states no return when the payout has not been reported yet", () => {
    const ticket = order({ status: "redeemable", payoutAtomic: null });
    expect(sportsbookWonEvent(ticket)?.pnl).toBeNull();
  });

  it("reports nothing while the ticket is still running", () => {
    expect(sportsbookWonEvent(order({ status: "live" }))).toBeNull();
  });

  it("reports nothing for a ticket with a losing leg on it", () => {
    const mixed = order({
      status: "redeemable",
      payoutAtomic: "2500000",
      legs: [leg({ result: "won" }), leg({ result: "lost", index: 1 })],
    });
    expect(sportsbookWonEvent(mixed)).toBeNull();
  });
});

describe("observing a polled ticket", () => {
  it("reports an acceptance only when the status is seen leaving the processing set", () => {
    expect(observeSportsbookOrder(order({ status: "submitted" }))).toEqual([]);
    const events = observeSportsbookOrder(order({ status: "accepted" }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "placed", id: "ticket-1" });
  });

  it("does not report an acceptance it never witnessed", () => {
    // A history row that was already accepted when this session first saw it.
    expect(observeSportsbookOrder(order({ status: "accepted" }))).toEqual([]);
  });

  it("reports a win when the status is seen entering a winning one, and never again", () => {
    expect(observeSportsbookOrder(order({ status: "live" }), NOW)).toEqual([]);
    const events = observeSportsbookOrder(won(), NOW);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "won", id: "ticket-1:won" });

    expect(observeSportsbookOrder(won(), NOW)).toEqual([]);
    expect(observeSportsbookOrder(won({ status: "redeemed" }), NOW)).toEqual([]);
  });

  it("does not post a ticket that was already settled when the page opened", () => {
    // The case the day this ships: an account with settled winning tickets and
    // an empty dedup store. Every row here is a first observation, so every one
    // of them is where the ticket already was rather than something it did.
    expect(observeSportsbookOrder(won(), NOW)).toEqual([]);
    expect(observeSportsbookOrder(won({ ticketId: "ticket-2" }), NOW)).toEqual([]);
    expect(observeSportsbookOrder(won({ ticketId: "ticket-3" }), NOW)).toEqual([]);

    // And a focus refetch of the same three rows says nothing either.
    expect(observeSportsbookOrder(won(), NOW)).toEqual([]);
    expect(observeSportsbookOrder(won({ ticketId: "ticket-2" }), NOW)).toEqual([]);
  });

  it("does not post a win whose settlement is older than the freshness bound", () => {
    const longAgo = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();
    const stale = won({ settlement: { ...SETTLED, resolvedAt: longAgo }, updatedAt: longAgo });
    observeSportsbookOrder(order({ status: "live" }), NOW);
    expect(observeSportsbookOrder(stale, NOW)).toEqual([]);
  });

  it("does not report the same acceptance twice", () => {
    observeSportsbookOrder(order({ status: "submitted" }));
    expect(observeSportsbookOrder(order({ status: "accepted" }))).toHaveLength(1);
    expect(observeSportsbookOrder(order({ status: "accepted" }))).toEqual([]);
  });
});

describe("how old a settlement may be", () => {
  it("accepts one that landed inside the bound", () => {
    expect(settledRecently(won(), NOW)).toBe(true);
  });

  it("refuses one that landed outside it", () => {
    const past = new Date(NOW - SHINE_SETTLEMENT_MAX_AGE_MS - 1).toISOString();
    const stale = won({ settlement: { ...SETTLED, resolvedAt: past }, updatedAt: past });
    expect(settledRecently(stale, NOW)).toBe(false);
  });

  it("falls back to the row's own timestamp when the provider gave none", () => {
    const noResolvedAt = won({
      settlement: { ...SETTLED, resolvedAt: null },
      updatedAt: new Date(NOW - 25 * 60 * 60 * 1000).toISOString(),
    });
    expect(settledRecently(noResolvedAt, NOW)).toBe(false);
  });
});
