"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ChessRoundPageShell, LichessAnalysis } from "@/features/casino";

function ReviewFromParams() {
  return <LichessAnalysis matchId={useSearchParams()?.get("match") ?? null} />;
}

export default function ChessReviewPage() {
  return (
    <ChessRoundPageShell fixedViewport={false}>
      <Suspense fallback={null}>
        <ReviewFromParams />
      </Suspense>
    </ChessRoundPageShell>
  );
}
