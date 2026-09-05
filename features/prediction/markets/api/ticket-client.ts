"use client";

import { formatUsdE6 } from "../bet-slip";
import { isBookingCode, normalizeBookingCodeInput } from "../booking-code";
import type { SinglesBetReceipt } from "../singles-receipt";
import { predictionCombos } from "./service";
import type { SinglesTicket } from "./types";

export function buildSinglesTicketBody(receipt: SinglesBetReceipt) {
  return {
    bookingCode: receipt.bookingCode,
    status: receipt.status,
    requestedStakeE6: receipt.requestedStakeE6,
    spentE6: receipt.spentE6,
    referenceReturnE6: receipt.referenceReturnE6,
    filledCount: receipt.filledCount,
    acceptedCount: receipt.acceptedCount,
    orders: receipt.orders,
    placedAt: receipt.placedAt,
  };
}

export function persistSinglesTicket(receipt: SinglesBetReceipt): Promise<SinglesTicket> {
  return predictionCombos.post<SinglesTicket>("/singles/tickets", buildSinglesTicketBody(receipt));
}

export function fetchSinglesTicket(bookingCode: string): Promise<SinglesTicket> {
  const normalized = normalizeBookingCodeInput(bookingCode);
  if (!isBookingCode(normalized)) {
    return Promise.reject(new Error("Enter a valid 6-character booking code."));
  }
  return predictionCombos.authedGet<SinglesTicket>(
    `/singles/tickets/${encodeURIComponent(normalized)}`
  );
}

export function singlesTicketToReceipt(ticket: SinglesTicket): SinglesBetReceipt {
  const requestedStakeE6 = BigInt(ticket.requestedStakeE6);
  const spentE6 = BigInt(ticket.spentE6);
  const referenceReturnE6 = BigInt(ticket.referenceReturnE6);

  return {
    bookingCode: ticket.bookingCode,
    status: ticket.status,
    persistence: "saved",
    saveError: null,
    requestedStakeE6: ticket.requestedStakeE6,
    spentE6: ticket.spentE6,
    referenceReturnE6: ticket.referenceReturnE6,
    requestedStake: formatUsdE6(requestedStakeE6),
    spent: formatUsdE6(spentE6),
    referenceReturn: formatUsdE6(referenceReturnE6),
    filledCount: ticket.filledCount,
    acceptedCount: ticket.acceptedCount,
    orders: ticket.orders,
    placedAt: Date.parse(ticket.placedAt),
  };
}
