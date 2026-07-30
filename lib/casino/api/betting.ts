"use client";

import { casinoGet, casinoPost } from "@/lib/casino/api/client";
import type { BetSlip, MarketOdds, OddsPoint, PlaceBetInput } from "@/lib/casino/api/types";

// Spectator betting on a live match. Odds are priced by the server; the
// client never computes a payout it then asks to be paid. A placed bet
// escrows the stake and settles automatically when the match ends.

export async function fetchMarketOdds(matchId: string): Promise<MarketOdds> {
  return casinoGet<MarketOdds>(`/betting/markets/${encodeURIComponent(matchId)}/odds`);
}

export async function fetchOddsHistory(matchId: string): Promise<OddsPoint[]> {
  const data = await casinoGet<{ points: OddsPoint[] }>(
    `/betting/markets/${encodeURIComponent(matchId)}/odds/history`
  );
  return data.points;
}

// Places a spectator bet. The server rejects with ODDS_MOVED if the price has
// drifted past tolerance since `expectedOdds` was shown, and with
// INSUFFICIENT_BALANCE if the stake exceeds the caller's balance, so the UI
// can react precisely rather than showing a generic failure.
export async function placeBet(input: PlaceBetInput): Promise<BetSlip> {
  return casinoPost<BetSlip>("/betting/bets", input);
}

// The caller's own bets, newest first. Scoped to one match when a matchId is
// given, otherwise across the platform.
export async function fetchMyBets(matchId?: string): Promise<BetSlip[]> {
  const data = await casinoGet<{ bets: BetSlip[] }>(
    "/betting/bets",
    matchId ? { matchId } : undefined
  );
  return data.bets;
}
