"use client";

import { casinoGet } from "@/lib/casino/api/client";
import type { GamePresence, RecentWin } from "@/lib/casino/api/types";

// Hub-level reads: what is happening across every game right now.

export async function fetchRecentWins(limit = 12): Promise<RecentWin[]> {
  const data = await casinoGet<{ wins: RecentWin[] }>("/hub/recent-wins", {
    limit: String(limit),
  });
  return data.wins;
}

export async function fetchGamePresence(): Promise<GamePresence[]> {
  const data = await casinoGet<{ presence: GamePresence[] }>("/hub/presence");
  return data.presence;
}
