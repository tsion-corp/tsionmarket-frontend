"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage } from "@/features/casino/components/casino-page";
import { CheckersReview } from "@/features/casino/components/draughts/checkers-review";
import { isMatchId } from "@/features/casino/lib/api/draughts-wire";

function ReviewRoute() {
  const params = useSearchParams();
  const matchId = params.get("match");
  const valid = matchId && isMatchId(matchId) ? matchId : null;

  if (!valid) {
    return (
      <p className="py-16 text-center text-[14px] text-white/50">
        That review link isn&rsquo;t valid.
      </p>
    );
  }
  return <CheckersReview matchId={valid} />;
}

export default function CheckersReviewPage() {
  return (
    <CasinoPage hideBackLink immersive>
      <Suspense fallback={<p className="py-16 text-center text-white/50">Loading review...</p>}>
        <ReviewRoute />
      </Suspense>
    </CasinoPage>
  );
}
