"use client";

import { createServiceClient } from "@/lib/api/service";

export type CasinoPresenceGame = "chess" | "arkball" | "arkjet" | "chicken";

export interface CasinoGamePresence {
  game: CasinoPresenceGame;
  playersOnline: number;
  estimated: boolean;
}

export interface CasinoPresenceSnapshot {
  generatedAt: string;
  refreshAfterSeconds: number;
  games: CasinoGamePresence[];
}

export type CasinoPresenceByGame = Partial<Record<CasinoPresenceGame, CasinoGamePresence>>;

const casino = createServiceClient("/api/casino", "Game presence is unavailable right now.", {
  timeoutMs: 5_000,
});

export function fetchCasinoPresence(): Promise<CasinoPresenceSnapshot> {
  return casino.get<CasinoPresenceSnapshot>("/presence");
}

export function indexCasinoPresence(snapshot: CasinoPresenceSnapshot): CasinoPresenceByGame {
  const indexed: CasinoPresenceByGame = {};
  for (const presence of snapshot.games) indexed[presence.game] = presence;
  return indexed;
}
