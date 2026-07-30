"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage } from "@/components/dashboard/casino/casino-page";
import { PlaySection } from "@/components/dashboard/casino/chess/play-section";
import {
  parseCurrencyParam,
  parseStakeMinorParam,
  parseTimeControlParam,
} from "@/lib/casino/stake-params";

function PlayFromParams() {
  const params = useSearchParams();
  return (
    <PlaySection
      stakeMinor={parseStakeMinorParam(params.get("stake"))}
      currency={parseCurrencyParam(params.get("cur"))}
      timeControl={parseTimeControlParam(params.get("tc"))}
    />
  );
}

export default function ChessPlayPage() {
  return (
    <CasinoPage>
      <Suspense fallback={null}>
        <PlayFromParams />
      </Suspense>
    </CasinoPage>
  );
}
