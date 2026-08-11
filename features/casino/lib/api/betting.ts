"use client";

// Pari-mutuel spectator betting on a live chess match. These endpoints live on
// the chess service (alongside /matches and /cashier), so they go through the
// chess client, not the generic casino one. Stakes are USDC reserved from the
// caller's cashier balance and settle automatically when the match ends.

import { chessGet, chessPost } from "@/features/casino/lib/api/chess-client";
import {
  toBetSlip,
  toMarketOdds,
  type BetSlipWire,
  type MarketOddsWire,
} from "@/features/casino/lib/api/betting-wire";
import type { BetSlip, MarketOdds, PlaceBetInput } from "@/features/casino/lib/api/types";

export async function fetchMarketOdds(matchId: string): Promise<MarketOdds> {
  return toMarketOdds(
    await chessGet<MarketOddsWire>(`/betting/markets/${encodeURIComponent(matchId)}/odds`)
  );
}

// Places a spectator bet. The service reserves the stake from the bettor's
// cashier balance. It rejects with FORBIDDEN if the bettor holds a side in the
// match (players cannot bet on their own game) and CONFLICT once the match is
// no longer active, so the UI can react precisely.
export async function placeBet(input: PlaceBetInput): Promise<BetSlip> {
  return toBetSlip(
    await chessPost<BetSlipWire>("/betting/bets", {
      matchId: input.matchId,
      bettor: input.bettor,
      // The wire field is `outcome`; our domain calls it `selection`.
      outcome: input.selection,
      stakeUsdc: input.stakeUsdc,
    })
  );
}

// The caller's own bets on one match, with their settlement state and payout.
export async function fetchMyBets(matchId: string, bettor: string): Promise<BetSlip[]> {
  const data = await chessGet<{ bets?: BetSlipWire[] } | BetSlipWire[]>(
    `/betting/markets/${encodeURIComponent(matchId)}/bets`,
    { bettor },
    { requireAuth: true }
  );
  const rows = Array.isArray(data) ? data : (data.bets ?? []);
  return rows.map(toBetSlip);
}
