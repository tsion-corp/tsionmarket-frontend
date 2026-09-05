import type { OrderResponse } from "@polymarket/client";
import { formatUsdE6, referenceReturnE6, type MarketSlipSelection } from "./bet-slip";
import { bookingCodeFromSeed } from "./booking-code";

export type SinglesOrderStatus = "filled" | "pending" | "failed";
export type SinglesTicketStatus = "filled" | "partial" | "pending" | "failed";
export type SinglesTicketPersistence = "saving" | "saved" | "unsaved";

export interface SinglesReceiptOrder {
  selectionId: string;
  source: "sports" | "discovery";
  eventId: string;
  eventTitle: string;
  marketId: string;
  conditionId: string;
  tokenId: string;
  marketLabel: string;
  outcome: string;
  status: SinglesOrderStatus;
  orderId: string | null;
  transactionHash: string | null;
  error: string | null;
}

export interface SinglesBetReceipt {
  bookingCode: string;
  status: SinglesTicketStatus;
  persistence: SinglesTicketPersistence;
  saveError: string | null;
  requestedStakeE6: string;
  spentE6: string;
  referenceReturnE6: string;
  requestedStake: string;
  spent: string;
  referenceReturn: string;
  filledCount: number;
  acceptedCount: number;
  orders: SinglesReceiptOrder[];
  placedAt: number;
}

export type SinglesOrderResult =
  | { selection: MarketSlipSelection; response: OrderResponse }
  | { selection: MarketSlipSelection; error: string };

const E6 = 1_000_000n;

function decimalToE6(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{0,6}))?$/u.exec(value);
  if (!match) return 0n;
  return BigInt(match[1]) * E6 + BigInt((match[2] ?? "").padEnd(6, "0"));
}

export function singlesBookingCode(seed: string): string {
  return bookingCodeFromSeed(seed);
}

function receiptOrder(result: SinglesOrderResult): SinglesReceiptOrder {
  const base = {
    selectionId: result.selection.id,
    source: result.selection.source,
    eventId: result.selection.eventId,
    eventTitle: result.selection.eventTitle,
    marketId: result.selection.marketId,
    conditionId: result.selection.conditionId,
    tokenId: result.selection.tokenId,
    marketLabel: result.selection.marketLabel,
    outcome: result.selection.outcome,
  };

  if ("error" in result) {
    return {
      ...base,
      status: "failed",
      orderId: null,
      transactionHash: null,
      error: result.error,
    };
  }
  if (!result.response.ok) {
    return {
      ...base,
      status: "failed",
      orderId: null,
      transactionHash: null,
      error: result.response.message,
    };
  }

  return {
    ...base,
    status: result.response.status === "matched" ? "filled" : "pending",
    orderId: result.response.orderId,
    transactionHash: result.response.transactionsHashes[0] ?? null,
    error: null,
  };
}

function ticketStatus(orders: SinglesReceiptOrder[]): SinglesTicketStatus {
  const filled = orders.filter(({ status }) => status === "filled").length;
  const pending = orders.filter(({ status }) => status === "pending").length;
  const failed = orders.length - filled - pending;
  if (filled === orders.length) return "filled";
  if (filled > 0 || (pending > 0 && failed > 0)) return "partial";
  if (pending > 0) return "pending";
  return "failed";
}

export function createSinglesBetReceipt(input: {
  bookingSeed: string;
  results: SinglesOrderResult[];
  stakeE6: bigint;
  placedAt?: number;
}): SinglesBetReceipt {
  const orders = input.results.map(receiptOrder);
  const responses = input.results.flatMap((result) =>
    "response" in result && result.response.ok ? [result.response] : []
  );
  const spentE6 = responses.reduce(
    (total, response) => total + decimalToE6(response.makingAmount),
    0n
  );
  const selections = input.results.map(({ selection }) => selection);
  const requestedStakeE6 = input.stakeE6 * BigInt(orders.length);
  const estimatedReturnE6 = referenceReturnE6(selections, input.stakeE6, "singles");

  return {
    bookingCode: singlesBookingCode(input.bookingSeed),
    status: ticketStatus(orders),
    persistence: "saving",
    saveError: null,
    requestedStakeE6: requestedStakeE6.toString(),
    spentE6: spentE6.toString(),
    referenceReturnE6: estimatedReturnE6.toString(),
    requestedStake: formatUsdE6(requestedStakeE6),
    spent: formatUsdE6(spentE6),
    referenceReturn: formatUsdE6(estimatedReturnE6),
    filledCount: orders.filter(({ status }) => status === "filled").length,
    acceptedCount: orders.filter(({ status }) => status !== "failed").length,
    orders,
    placedAt: input.placedAt ?? Date.now(),
  };
}
