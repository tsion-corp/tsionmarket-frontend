"use client";

import {
  isHexBetCode,
  normalizeHexBetCodeInput,
  POLYMARKET_BET_CODE_LENGTH,
} from "../../ticket-code";
import { predictionCombos } from "./service";
import type { HouseTicket, HouseTicketsPage, PrepareHouseLeg } from "./types";

export function prepareHouseTicket(stakeE6: bigint, legs: PrepareHouseLeg[]): Promise<HouseTicket> {
  return predictionCombos.post<HouseTicket>("/house/tickets/prepare", {
    stakeE6: stakeE6.toString(),
    legs,
  });
}

export function confirmHouseTicket(
  ticketId: string,
  transactionHash: string
): Promise<HouseTicket> {
  return predictionCombos.post<HouseTicket>(
    `/house/tickets/${encodeURIComponent(ticketId)}/confirm`,
    { transactionHash }
  );
}

export function fetchHouseTickets(): Promise<HouseTicketsPage> {
  return predictionCombos.authedGet<HouseTicketsPage>("/house/tickets");
}

export function fetchHouseTicketByBookingCode(bookingCode: string): Promise<HouseTicket> {
  const normalized = normalizeHexBetCodeInput(bookingCode, POLYMARKET_BET_CODE_LENGTH);
  if (!isHexBetCode(normalized, POLYMARKET_BET_CODE_LENGTH)) {
    return Promise.reject(new Error("Enter a valid 6-character hexadecimal ticket code."));
  }
  return predictionCombos.authedGet<HouseTicket>(
    `/house/tickets/booking/${encodeURIComponent(normalized)}`
  );
}
