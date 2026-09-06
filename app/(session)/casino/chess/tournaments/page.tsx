"use client";

import { CasinoPage, SwissListSection } from "@/features/casino";

export default function ChessTournamentsPage() {
  return (
    <CasinoPage hideBackLink>
      <SwissListSection game="chess" format="champions" />
    </CasinoPage>
  );
}
