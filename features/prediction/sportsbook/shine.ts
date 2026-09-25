// What a sportsbook ticket tells Shine, and the session-scoped memory that
// keeps a polled status from saying it twice.
//
// Both reportable moments here are derived state: an acceptance is a status
// the order poll flips to, and a win is a field on a row the history refetches
// on every window focus. Neither has a guard of any kind in the sportsbook
// code today, because until now both only ever opened a panel.
//
// The durable defence is the dedup store behind reportShine, which survives a
// reload (ADR-2026-09-24 section 2). What lives here is the layer in front of
// it: a stable id per moment, and a record of what this session has already
// handed over, so a remount or a refocus does not even reach the store.
//
// THE STORE DOES NOT COVER THE FIRST POST, ONLY THE SECOND.
//
// On the day this ships every account already holds settled tickets and an
// empty dedup store, so ten old winning tickets are ten distinct ids that the
// store would wave through — ten real posts about bets that settled weeks ago,
// each stamped by the square with the moment it arrived. Two rules below stop
// that: nothing is reported from a state this client did not watch the ticket
// enter, and nothing is reported about a settlement older than
// SHINE_SETTLEMENT_MAX_AGE_MS.

import { oddsFromDecimalString, pnlPercentFromBaseUnits } from "@/lib/shine/money";
import type { ShineEvent } from "@/lib/shine/types";
import type { SportsbookOrder, SportsbookOrderStatus } from "./api";
import { isLostSelectionResult } from "./ticket-status";

export type SportsPlacedEvent = Extract<ShineEvent, { service: "sports"; kind: "placed" }>;
export type SportsWonEvent = Extract<ShineEvent, { service: "sports"; kind: "won" }>;

/** Before the venue has answered. A ticket in here has not been accepted. */
const PLACING: ReadonlySet<string> = new Set<SportsbookOrderStatus>([
  "draft",
  "awaiting_signature",
  "submitted",
]);

/** The venue took the bet. This is what "accepted" means for a post. */
const ACCEPTED: ReadonlySet<string> = new Set<SportsbookOrderStatus>([
  "accepted",
  "partially_accepted",
  "live",
  "pending_resolution",
]);

/** Settled in the holder's favour, which the panels draw in green. */
const POSITIVE: ReadonlySet<string> = new Set<SportsbookOrderStatus>([
  "won",
  "redeemable",
  "redeemed",
]);

const BASE_UNITS = /^\d+$/u;

function baseUnits(value: string | null | undefined): bigint | null {
  if (typeof value !== "string" || !BASE_UNITS.test(value.trim())) return null;
  return BigInt(value.trim());
}

/**
 * The fixture a post names. One leg names its own; a combo names each of them,
 * because no single fixture describes the ticket.
 */
function fixture(order: SportsbookOrder): string | null {
  const titles = [...new Set(order.legs.map((leg) => leg.eventTitle.trim()).filter(Boolean))];
  return titles.length === 0 ? null : titles.join(" + ");
}

/**
 * The selection a post names, and every leg of a combo in slip order.
 *
 * Joined with punctuation rather than a word: the composer writes the sentence
 * in the author's locale, and an English "and" pasted into the middle of it
 * would be the one word in the post that was not.
 */
function selection(order: SportsbookOrder): string | null {
  const titles = order.legs.map((leg) => leg.outcomeTitle.trim()).filter(Boolean);
  return titles.length === 0 ? null : titles.join(", ");
}

/**
 * The odds the slip was struck at, or null for a combo.
 *
 * A ticket reports odds per leg and no total, and the total is not the payout
 * over the stake either: a sponsored bet or a freebet moves that ratio without
 * moving the odds. So a combo states no odds rather than a figure assembled
 * out of two that do not mean it.
 */
function placedOdds(order: SportsbookOrder) {
  if (order.legs.length !== 1) return null;
  const leg = order.legs[0];
  return oddsFromDecimalString(leg.acceptedOdds ?? leg.requestedOdds);
}

/** True when the ticket is settled in the holder's favour with nothing lost. */
export function isWinningTicket(order: SportsbookOrder): boolean {
  if (!POSITIVE.has(order.status)) return false;
  return !order.legs.some((leg) => isLostSelectionResult(leg.result));
}

/**
 * How old a settlement may be and still be worth posting.
 *
 * A Shine post carries no date — the square stamps it with the moment it
 * arrives — so a win from three weeks ago reads as one that just landed. On the
 * day this ships every account already holds settled tickets and an empty dedup
 * store, and the store only ever stops the SECOND post of something.
 *
 * Twenty-four hours, matching the bound the arcade uses, and the asymmetry is
 * the reason: a post missed because nobody opened the page can be written by
 * hand, and a post that should never have been made cannot be retracted.
 */
export const SHINE_SETTLEMENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the ticket settled recently enough to be worth posting.
 *
 * The settlement instant is the provider's `resolvedAt`, falling back to the
 * row's own `updatedAt`. When neither can be read this answers true, and that
 * is safe only because of where it is called: the sole caller has already seen
 * this client watch the ticket ENTER a winning status, so the settlement
 * happened while this session was running whatever the row says about it.
 */
export function settledRecently(order: SportsbookOrder, now: number = Date.now()): boolean {
  const stamp = order.settlement?.resolvedAt ?? order.updatedAt;
  const at = Date.parse(stamp ?? "");
  if (Number.isNaN(at)) return true;
  return now - at <= SHINE_SETTLEMENT_MAX_AGE_MS;
}

/** The event an accepted ticket warrants, or null when there is nothing to say. */
export function sportsbookPlacedEvent(order: SportsbookOrder): SportsPlacedEvent | null {
  const event = fixture(order);
  const pick = selection(order);
  if (!order.ticketId || !event || !pick) return null;
  return {
    service: "sports",
    kind: "placed",
    id: order.ticketId,
    event,
    selection: pick,
    odds: placedOdds(order),
  };
}

/**
 * The event a won ticket warrants, or null when it has not won.
 *
 * The return is the payout measured against the stake, both in the settlement
 * token's own base units, so the ratio never touches a float. It is null when
 * the payout has not been reported yet: the win is still true, and the post
 * states the win without a figure rather than waiting for one that may never
 * arrive.
 *
 * The id carries a `:won` suffix because the dedup store keys on account,
 * service and id alone: sharing the bare ticket id with the acceptance would
 * make the second of the two moments look like a duplicate of the first.
 */
export function sportsbookWonEvent(order: SportsbookOrder): SportsWonEvent | null {
  if (!isWinningTicket(order)) return null;
  const event = fixture(order);
  const pick = selection(order);
  if (!order.ticketId || !event || !pick) return null;
  const stake = baseUnits(order.stakeAtomic);
  const payout = baseUnits(order.payoutAtomic);
  return {
    service: "sports",
    kind: "won",
    id: `${order.ticketId}:won`,
    event,
    selection: pick,
    pnl: stake !== null && payout !== null ? pnlPercentFromBaseUnits(stake, payout) : null,
  };
}

// The last status this session saw a ticket in, and what it has already handed
// to Shine. Module scope rather than a ref: a component that remounts — the
// ticket modal reopening, the slip switching tabs — must not get a clean slate,
// or the win it already reported would be reported again the moment it renders.
//
// Capped because a session that pages through a long history should not grow
// this without limit. Eviction is oldest-first and costs at worst one duplicate
// that the durable store then catches.
const MAX_TRACKED_TICKETS = 500;
const lastStatus = new Map<string, string>();
const handedOver = new Set<string>();

function remember(ticketId: string, status: string): void {
  lastStatus.set(ticketId, status);
  if (lastStatus.size > MAX_TRACKED_TICKETS) {
    const oldest = lastStatus.keys().next();
    if (!oldest.done) lastStatus.delete(oldest.value);
  }
}

function claim(key: string): boolean {
  if (handedOver.has(key)) return false;
  handedOver.add(key);
  if (handedOver.size > MAX_TRACKED_TICKETS * 2) {
    const oldest = handedOver.values().next();
    if (!oldest.done) handedOver.delete(oldest.value);
  }
  return true;
}

/**
 * Everything one observation of a ticket warrants, each event at most once per
 * session.
 *
 * NOTHING IS REPORTED FROM A STATE THIS CLIENT DID NOT WATCH IT ENTER.
 *
 * A row's status says what a ticket IS, never when it became that. A ticket
 * that was already accepted, or already won, the first time this session saw it
 * became so somewhere else — possibly weeks ago — and the order history is a
 * list of exactly those. Reporting on the state alone would publish a person's
 * back catalogue the first time they focused the tab after this shipped, each
 * row under its own id and so each one waved through by the dedup store, and
 * every post reading as something that had just happened.
 *
 * So the first observation of a ticket only records where it was. An
 * acceptance is reported when the poll is seen leaving the processing
 * statuses, and a win when it is seen entering a winning one, which is the
 * same rule the arcade applies to a finished match.
 */
export function observeSportsbookOrder(
  order: SportsbookOrder,
  now: number = Date.now()
): ShineEvent[] {
  if (!order.ticketId) return [];
  const previous = lastStatus.get(order.ticketId);
  remember(order.ticketId, order.status);
  // First sight: this is where the ticket already was, not something it did.
  if (previous === undefined) return [];

  const events: ShineEvent[] = [];

  if (PLACING.has(previous) && ACCEPTED.has(order.status)) {
    const placed = sportsbookPlacedEvent(order);
    if (placed && claim(placed.id)) events.push(placed);
  }

  if (!POSITIVE.has(previous) && settledRecently(order, now)) {
    const won = sportsbookWonEvent(order);
    if (won && claim(won.id)) events.push(won);
  }

  return events;
}

/** Forgets what this session has seen. For tests only. */
export function resetSportsbookShineMemory(): void {
  lastStatus.clear();
  handedOver.clear();
}
