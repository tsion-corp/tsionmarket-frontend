import { describe, expect, it } from "vitest";
import {
  arkjetPlacedProps,
  arkjetSettledEvent,
  ticketSlot,
} from "@/features/casino/lib/arkjet-analytics";
import type { ArkjetBet } from "@/features/casino/lib/api/arkjet";

function bet(over: Partial<ArkjetBet> = {}): ArkjetBet {
  return {
    betId: "b1",
    roundId: "r1",
    panelId: "A",
    currency: "USDC",
    amount: "5",
    maximumCashoutMultiplier: "100",
    automaticCashoutMultiplier: null,
    maximumPayout: "500",
    reservedNetLiability: "0",
    status: "ACCEPTED",
    cashoutMultiplier: null,
    payout: null,
    idempotencyKey: "k1",
    acceptedAt: "2026-09-22T00:00:00Z",
    settledAt: null,
    ...over,
  };
}

describe("ticketSlot", () => {
  it("numbers the two panels, which the catalog counts rather than letters", () => {
    expect(ticketSlot("A")).toBe(1);
    expect(ticketSlot("B")).toBe(2);
  });
});

describe("arkjetPlacedProps", () => {
  it("reports a hand-flown ticket as manual, with no auto multiplier", () => {
    expect(arkjetPlacedProps(bet())).toEqual({
      round_id: "r1",
      ticket_slot: 1,
      amount_usd: 5,
      mode: "manual",
    });
  });

  it("reports a ticket set to leave on its own as auto, at its multiplier", () => {
    expect(arkjetPlacedProps(bet({ panelId: "B", automaticCashoutMultiplier: "2.5" }))).toEqual({
      round_id: "r1",
      ticket_slot: 2,
      amount_usd: 5,
      mode: "auto",
      auto_cashout_x: 2.5,
    });
  });
});

describe("arkjetSettledEvent", () => {
  it("reports a cash-out at its multiplier and payout", () => {
    const settled = arkjetSettledEvent(
      bet({ status: "CASHED_OUT", cashoutMultiplier: "2.4", payout: "12" })
    );
    expect(settled).toEqual({
      name: "arkjet_cashed_out",
      props: {
        round_id: "r1",
        ticket_slot: 1,
        amount_usd: 5,
        multiplier: 2.4,
        payout_usd: 12,
      },
    });
  });

  it("reports a loss at the multiplier the jet crashed on", () => {
    const settled = arkjetSettledEvent(bet({ status: "LOST" }), "1.83");
    expect(settled).toEqual({
      name: "arkjet_round_lost",
      props: { round_id: "r1", ticket_slot: 1, amount_usd: 5, crash_multiplier: 1.83 },
    });
  });

  it("leaves the crash multiplier off rather than reporting a crash at 0x", () => {
    const settled = arkjetSettledEvent(bet({ status: "LOST" }), null);
    expect(settled?.props).not.toHaveProperty("crash_multiplier");
  });

  it("reports nothing for a ticket that is still riding", () => {
    expect(arkjetSettledEvent(bet())).toBeNull();
  });

  it("reports nothing for a cancelled ticket, which neither won nor lost", () => {
    // The round never ran for it and the stake came back. Counting it as a
    // loss would put money in the lost column that nobody lost.
    expect(arkjetSettledEvent(bet({ status: "CANCELLED" }))).toBeNull();
  });
});
