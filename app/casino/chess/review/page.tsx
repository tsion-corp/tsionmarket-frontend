"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage } from "@/components/dashboard/casino/casino-page";
import { ReviewSection } from "@/components/dashboard/casino/chess/review-section";

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
