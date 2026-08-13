"use client";

import { chessGet, chessPost } from "@/features/casino/lib/api/chess-client";

export type SwissMarketStatus = "pending" | "open" | "closed" | "settled" | "voided";
export type SwissBetStatus = "active" | "won" | "lost" | "refunded";

export interface SwissMarketOutcome {
  playerId: string;
  playerName: string;
  poolUsdc: string;
  decimalOdds: string | null;
}

export interface SwissMarketOdds {
  swissId: string;
  status: SwissMarketStatus;
  totalPoolUsdc: string;
  rakeBps: number;
  outcomes: SwissMarketOutcome[];
  winningPlayerId: string | null;
  voidReason: string | null;
}

export interface SwissBet {
  id: string;
  swissId: string;
  bettor: string;
  predictedPlayerId: string;
  stakeUsdc: string;
  status: SwissBetStatus;
  payoutUsdc: string;
  createdAt: string;
}

export interface PlaceSwissBetInput {
  swissId: string;
  bettor: string;
  predictedPlayerId: string;
  stakeUsdc: string;
  idempotencyKey: string;
}

export function fetchSwissMarketOdds(swissId: string): Promise<SwissMarketOdds> {
  return chessGet<SwissMarketOdds>(`/betting/swiss/${encodeURIComponent(swissId)}/odds`);
}

export function fetchSwissBets(swissId: string, bettor: string): Promise<SwissBet[]> {
  return chessGet<SwissBet[]>(
    `/betting/swiss/${encodeURIComponent(swissId)}/bets`,
    { bettor },
    { requireAuth: true }
  );
}

export function placeSwissBet(input: PlaceSwissBetInput): Promise<SwissBet> {
  return chessPost<SwissBet>(`/betting/swiss/${encodeURIComponent(input.swissId)}/bets`, {
    bettor: input.bettor,
    predictedPlayerId: input.predictedPlayerId,
    stakeUsdc: input.stakeUsdc,
    idempotencyKey: input.idempotencyKey,
  });
}
