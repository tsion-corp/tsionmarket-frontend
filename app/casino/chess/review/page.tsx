"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage, ReviewSection } from "@/features/casino";

function ReviewFromParams() {
  return <ReviewSection matchId={useSearchParams()?.get("match") ?? null} />;
}

export default function ChessReviewPage() {
  return (
    <CasinoPage>
      <Suspense fallback={null}>
        <ReviewFromParams />
      </Suspense>
    </CasinoPage>
  );
}
