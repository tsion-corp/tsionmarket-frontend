"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage } from "@/features/casino/components/casino-page";
import { CheckersPlay } from "@/features/casino/components/draughts/checkers-play";
import { isMatchId } from "@/features/casino/lib/api/draughts-wire";

// A board is addressed by /casino/checkers/play?match=<id>, which is what an
// invite link carries.
function PlayRoute() {
  const params = useSearchParams();
  const matchId = params.get("match");
  const valid = matchId && isMatchId(matchId) ? matchId : null;

  if (!valid) {
    return (
      <p className="py-16 text-center font-sans text-[14px] text-white/50">
        That game link isn&rsquo;t valid.
      </p>
    );
  }
  return <CheckersPlay matchId={valid} />;
}

export default function CheckersPlayPage() {
  return (
    <CasinoPage hideBackLink>
      <Suspense
        fallback={<p className="py-16 text-center font-sans text-[14px] text-white/50">Loading…</p>}
      >
        <PlayRoute />
      </Suspense>
    </CasinoPage>
  );
}
