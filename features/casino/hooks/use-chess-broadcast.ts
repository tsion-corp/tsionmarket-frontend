"use client";

// Chess's caller of the shared broadcast. All the mechanics live in
// `useGameBroadcast`; this only says what chess is broadcasting and where a
// viewer lands. It stays a named hook because the round view and its tests
// both reach for it.

import { useMemo } from "react";
import {
  useGameBroadcast,
  type GameBroadcastActions,
  type GameBroadcastState,
  type GameBroadcastTarget,
} from "@/features/casino/hooks/use-game-broadcast";
import {
  broadcastTitle,
  CHESS_DESCRIPTION_LEAD,
  matchWatchPath,
} from "@/features/casino/lib/chess/broadcast";

export type ChessBroadcastState = GameBroadcastState;
export type ChessBroadcastActions = GameBroadcastActions;

export function useChessBroadcast(
  matchId: string | null,
  whiteName: string,
  blackName: string
): ChessBroadcastState & ChessBroadcastActions {
  const target = useMemo<GameBroadcastTarget | null>(
    () =>
      matchId
        ? {
            game: "chess",
            ref: matchId,
            title: broadcastTitle(whiteName, blackName),
            watchPath: matchWatchPath(matchId),
            descriptionLead: CHESS_DESCRIPTION_LEAD,
            // A chessboard is a near-static image where sharpness matters far
            // more than framerate.
            content: "detail",
            creatorApplicationNote: "I play chess on Ark and want to broadcast my matches.",
          }
        : null,
    [matchId, whiteName, blackName]
  );
  return useGameBroadcast(target);
}
