"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage } from "@/components/dashboard/casino/casino-page";
import { MatchmakingSection } from "@/components/dashboard/casino/chess/matchmaking-section";
import {
  parseCurrencyParam,
  parseStakeMinorParam,
  parseTimeControlParam,
} from "@/lib/casino/stake-params";

function MatchmakingFromParams() {
  const params = useSearchParams();
  return (
    <MatchmakingSection
      stakeMinor={parseStakeMinorParam(params.get("stake"))}
      currency={parseCurrencyParam(params.get("cur"))}
      timeControl={parseTimeControlParam(params.get("tc"))}
    />
  );
}

export default function ChessMatchmakingPage() {
  return (
    <CasinoPage>
      <Suspense fallback={null}>
        <MatchmakingFromParams />
      </Suspense>
    </CasinoPage>
  );
}
