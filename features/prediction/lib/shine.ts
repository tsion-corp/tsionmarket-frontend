// What a filled prediction order tells Shine.
//
// A fill-and-kill order that came back `ok` matched rather than rested, and
// that is the strongest signal this service offers — nothing re-reads the
// position afterwards (ADR-2026-09-24 section 4). So the post says what
// happened, an entry, and never claims a settlement nobody verified.

import { entryPriceFromBaseUnits, type EntryPrice } from "@/lib/shine/money";
import type { ShineEvent } from "@/lib/shine/types";
import { toBaseUnits } from "@/lib/trade/math";

export type PredictionShineEvent = Extract<ShineEvent, { service: "prediction" }>;

// Collateral and shares are both quoted to six places by the venue, and a
// price is the ratio of the two, so it is held at the same precision.
const PRICE_DECIMALS = 6;
const ONE_SHARE = 10n ** BigInt(PRICE_DECIMALS);

/**
 * The price per share a fill actually paid: the collateral committed divided
 * by the shares received, in base units the whole way.
 *
 * Both legs arrive as decimal strings and are never handed to `Number`: the
 * price is the part of a post that has to stay true forever, and there is no
 * confirmation step where a wrong one could be caught.
 *
 * Null above a dollar a share. A share of a prediction market pays out one
 * dollar, so it cannot cost one: a figure at or above that means the two legs
 * were read the wrong way round, and stating nothing beats stating that.
 */
export function predictionSharePrice(
  makingAmount: string | null | undefined,
  takingAmount: string | null | undefined
): EntryPrice | null {
  if (typeof makingAmount !== "string" || typeof takingAmount !== "string") return null;
  const committed = toBaseUnits(makingAmount, PRICE_DECIMALS);
  const received = toBaseUnits(takingAmount, PRICE_DECIMALS);
  if (committed <= 0n || received <= 0n) return null;
  const perShare = (committed * ONE_SHARE) / received;
  if (perShare >= ONE_SHARE) return null;
  return entryPriceFromBaseUnits(perShare, PRICE_DECIMALS);
}

export interface PredictionFill {
  /** The Polymarket order id, which is what the dedup store keys by. */
  orderId: string | null | undefined;
  /** The market question, as the market itself words it. */
  question: string | null | undefined;
  /** The outcome bought: "Yes", "No", or a named candidate. */
  outcome: string;
  makingAmount: string | null | undefined;
  takingAmount: string | null | undefined;
}

/**
 * The event a filled order warrants, or null when there is not enough to say
 * anything true.
 *
 * The market is named by its question and by nothing else. There is no
 * identifier on the event on purpose: a Shine post carries no deep link
 * (ADR-2026-09-24 section 5), and the only identifier this app holds for a
 * curated market besides the event id is a condition id, which no route here
 * takes and which would therefore name something no reader could open.
 */
export function predictionShineEvent(fill: PredictionFill): PredictionShineEvent | null {
  const orderId = fill.orderId?.trim();
  const market = fill.question?.trim();
  const outcome = fill.outcome.trim();
  if (!orderId || !market || !outcome) return null;
  return {
    service: "prediction",
    id: orderId,
    market,
    outcome,
    price: predictionSharePrice(fill.makingAmount, fill.takingAmount),
  };
}
