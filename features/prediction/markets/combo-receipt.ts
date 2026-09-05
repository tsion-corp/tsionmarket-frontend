import type { ComboQuote } from "@polymarket/client";
import { formatReferenceOdds, formatUsdE6, parseUsdE6 } from "./bet-slip";
import { bookingCodeFromSeed } from "./booking-code";

const E6 = 1_000_000n;

export interface ComboReceiptSelection {
  eventTitle: string;
  marketLabel: string;
  outcome: string;
}

export interface ComboBetReceipt {
  bookingCode: string;
  rfqId: string;
  transactionHash: string;
  stake: string;
  potentialReturn: string;
  decimalOdds: string;
  selections: ComboReceiptSelection[];
  placedAt: number;
}

export function comboBookingCode(rfqId: string): string {
  return bookingCodeFromSeed(rfqId);
}

export function comboQuoteOddsE6(quote: ComboQuote): bigint | null {
  const requiredE6 = parseUsdE6(quote.totalRequired);
  const returnE6 = parseUsdE6(quote.takerAmount);
  if (requiredE6 && returnE6) return (returnE6 * E6) / requiredE6;

  const priceE6 = parseUsdE6(quote.blendedPrice);
  return priceE6 ? (E6 * E6) / priceE6 : null;
}

export function createComboBetReceipt(input: {
  quote: ComboQuote;
  transactionHash: string;
  selections: ComboReceiptSelection[];
}): ComboBetReceipt {
  const stakeE6 = parseUsdE6(input.quote.totalRequired);
  const returnE6 = parseUsdE6(input.quote.takerAmount);
  const oddsE6 = comboQuoteOddsE6(input.quote);

  return {
    bookingCode: comboBookingCode(input.quote.rfqId),
    rfqId: input.quote.rfqId,
    transactionHash: input.transactionHash,
    stake: stakeE6 ? formatUsdE6(stakeE6) : `$${input.quote.totalRequired}`,
    potentialReturn: returnE6 ? formatUsdE6(returnE6) : `$${input.quote.takerAmount}`,
    decimalOdds: oddsE6 ? formatReferenceOdds(oddsE6) : "-",
    selections: input.selections,
    placedAt: Date.now(),
  };
}
