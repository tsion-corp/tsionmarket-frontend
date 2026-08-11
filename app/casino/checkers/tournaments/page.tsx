"use client";

import { CasinoPage } from "@/features/casino/components/casino-page";
import { SwissListSection } from "@/features/casino/components/chess/swiss/list-section";

// Swiss tournaments are one service-level feature shared by both board games,
// so the list is the same component filtered to the draughts ones.
export default function CheckersTournamentsPage() {
  return (
    <CasinoPage>
      <SwissListSection game="draughts" />
    </CasinoPage>
  );
}
