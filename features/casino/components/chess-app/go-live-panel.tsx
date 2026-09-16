"use client";

// Chess's binding of the shared go-live control. Only a participant sees it,
// and each player broadcasts their own stream, so both players can be live on
// the same match at once.
//
// The round view renders the panel twice (a mobile column and a desktop rail
// are both in the DOM, one hidden with CSS), so the provider is mounted once
// above both and each copy reads the same broadcast.

import {
  GameBroadcastProvider,
  GoLivePanel as SharedGoLivePanel,
  type BroadcastCopy,
} from "@/features/casino/components/broadcast/go-live-panel";
import { useChessBroadcast } from "@/features/casino/hooks/use-chess-broadcast";

const CHESS_COPY: BroadcastCopy = {
  subject: "the board",
  finishedNotice: "The match is over. End the broadcast so you are not streaming a finished board.",
};

export function ChessBroadcastProvider({
  matchId,
  whiteName,
  blackName,
  children,
}: {
  matchId: string | null;
  whiteName: string;
  blackName: string;
  children: React.ReactNode;
}) {
  const broadcast = useChessBroadcast(matchId, whiteName, blackName);
  return (
    <GameBroadcastProvider broadcast={broadcast} copy={CHESS_COPY}>
      {children}
    </GameBroadcastProvider>
  );
}

export function GoLivePanel({ matchOver }: { matchOver: boolean }) {
  return <SharedGoLivePanel activityOver={matchOver} />;
}
