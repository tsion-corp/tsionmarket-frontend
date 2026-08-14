"use client";

import { draughtsGet, draughtsPost } from "@/features/casino/lib/api/draughts-client";
import {
  toBetSlip,
  toMarketOdds,
  type BetSlipWire,
  type MarketOddsWire,
} from "@/features/casino/lib/api/betting-wire";
import type { BetSlip, MarketOdds, PlaceBetInput } from "@/features/casino/lib/api/types";

export async function fetchDraughtsMarketOdds(matchId: string): Promise<MarketOdds> {
  const wire = await draughtsGet<MarketOddsWire>(
    `/betting/markets/${encodeURIComponent(matchId)}/odds`
  );
  return toMarketOdds(wire);
}

export async function placeDraughtsBet(input: PlaceBetInput): Promise<BetSlip> {
  const wire = await draughtsPost<BetSlipWire>("/betting/bets", {
    matchId: input.matchId,
    bettor: input.bettor,
    outcome: input.selection,
    stakeUsdc: input.stakeUsdc,
    idempotencyKey: crypto.randomUUID(),
  });
  return toBetSlip(wire);
}

export async function fetchMyDraughtsBets(matchId: string, bettor: string): Promise<BetSlip[]> {
  const data = await draughtsGet<{ bets?: BetSlipWire[] } | BetSlipWire[]>(
    `/betting/markets/${encodeURIComponent(matchId)}/bets`,
    { bettor },
    { requireAuth: true }
  );
  const rows = Array.isArray(data) ? data : (data.bets ?? []);
  return rows.map(toBetSlip);
}
