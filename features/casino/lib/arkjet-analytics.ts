// What the Arkjet desk reports about a ticket.
//
// Two tickets can ride the same round, on panels A and B, so every event names
// its slot. The catalog numbers them 1 and 2; the service letters them.
//
// The money arrives as decimal strings from the service, and becomes a number
// only here, at the analytics edge.

import type { AnalyticsEvents } from "@/lib/analytics/events";
import type { ArkjetBet } from "@/features/casino/lib/api/arkjet";

/** Panel A is slot 1, panel B is slot 2. */
export function ticketSlot(panelId: ArkjetBet["panelId"]): number {
  return panelId === "A" ? 1 : 2;
}

/** A service amount as a number, or undefined when there is nothing usable. */
function amount(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * arkjet_ticket_placed for a bet the round accepted.
 *
 * A ticket carrying an automatic cash-out multiplier was set to leave on its
 * own, which is the catalog's "auto" mode; anything else is flown by hand.
 */
export function arkjetPlacedProps(bet: ArkjetBet): AnalyticsEvents["arkjet_ticket_placed"] {
  const auto = amount(bet.automaticCashoutMultiplier);
  return {
    round_id: bet.roundId,
    ticket_slot: ticketSlot(bet.panelId),
    amount_usd: amount(bet.amount) ?? 0,
    mode: auto === undefined ? "manual" : "auto",
    ...(auto === undefined ? {} : { auto_cashout_x: auto }),
  };
}

/**
 * What a settled bet reports, or null when it has not settled into one of the
 * two outcomes the catalog names.
 *
 * A cancelled ticket is neither a cash-out nor a loss: the round never ran for
 * it and the stake came back, so it is not reported as either.
 */
export function arkjetSettledEvent(
  bet: ArkjetBet,
  crashMultiplier?: string | null
):
  | { name: "arkjet_cashed_out"; props: AnalyticsEvents["arkjet_cashed_out"] }
  | { name: "arkjet_round_lost"; props: AnalyticsEvents["arkjet_round_lost"] }
  | null {
  const slot = ticketSlot(bet.panelId);
  const staked = amount(bet.amount) ?? 0;

  if (bet.status === "CASHED_OUT") {
    const multiplier = amount(bet.cashoutMultiplier);
    // A cash-out with no multiplier is not one we can report honestly: the
    // multiplier is the whole point of the event.
    if (multiplier === undefined) return null;
    return {
      name: "arkjet_cashed_out",
      props: {
        round_id: bet.roundId,
        ticket_slot: slot,
        amount_usd: staked,
        multiplier,
        payout_usd: amount(bet.payout) ?? 0,
      },
    };
  }

  if (bet.status === "LOST") {
    const crash = amount(crashMultiplier);
    return {
      name: "arkjet_round_lost",
      props: {
        round_id: bet.roundId,
        ticket_slot: slot,
        amount_usd: staked,
        // Where the jet actually crashed, when the round has said. Omitted
        // rather than sent as a zero, which would read as a crash at 0x.
        ...(crash === undefined ? {} : { crash_multiplier: crash }),
      },
    };
  }

  return null;
}
