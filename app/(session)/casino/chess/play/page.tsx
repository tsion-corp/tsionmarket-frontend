"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChessRoundPageShell, LichessRound, PlaySection } from "@/features/casino";

function PlayFromParams() {
  const params = useSearchParams();
  const matchId = params?.get("match") ?? null;
  const seatName = params?.get("player") ?? null;
  if (matchId) return <LichessRound matchId={matchId} seatName={seatName} />;
  return <PlaySection matchId={matchId} seatName={seatName} />;
}

export default function ChessPlayPage() {
  return (
    <ChessRoundPageShell>
      <Suspense fallback={null}>
        <PlayFromParams />
      </Suspense>
    </ChessRoundPageShell>
  );
}
