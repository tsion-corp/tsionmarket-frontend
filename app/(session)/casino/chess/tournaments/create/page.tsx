"use client";

import { CasinoPage, SwissCreateForm } from "@/features/casino";

export default function ChessTournamentCreatePage() {
  return (
    <CasinoPage hideBackLink>
      <div className="mx-auto w-full max-w-[760px] px-4 pt-8 pb-20 sm:px-6">
        <SwissCreateForm game="chess" format="champions" />
      </div>
    </CasinoPage>
  );
}
