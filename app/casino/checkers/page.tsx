"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CasinoPage } from "@/features/casino/components/casino-page";
import { CheckersLanding } from "@/features/casino/components/draughts/checkers-landing";
import { isMatchId } from "@/features/casino/lib/api/draughts-wire";

// The landing menu. A board now has its own route, but invite links handed out
// before that still carry ?match=<id> here, so those are forwarded rather than
// broken.
function CheckersRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const matchId = params.get("match");
  const legacyMatch = matchId && isMatchId(matchId) ? matchId : null;

  useEffect(() => {
    if (legacyMatch) router.replace(`/casino/checkers/play?match=${legacyMatch}`);
  }, [legacyMatch, router]);

  if (legacyMatch) return null;
  return <CheckersLanding />;
}

export default function CheckersPage() {
  return (
    <CasinoPage hideBackLink>
      {/* useSearchParams suspends on the server render, so the boundary is
          required for the route to prerender. */}
      <Suspense
        fallback={<p className="py-16 text-center font-sans text-[14px] text-white/50">Loading…</p>}
      >
        <CheckersRoute />
      </Suspense>
    </CasinoPage>
  );
}
