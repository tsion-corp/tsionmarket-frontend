"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CasinoPage, PlaySection } from "@/features/casino";

function PlayFromParams() {
  const params = useSearchParams();
  return (
    <PlaySection matchId={params?.get("match") ?? null} seatName={params?.get("player") ?? null} />
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
