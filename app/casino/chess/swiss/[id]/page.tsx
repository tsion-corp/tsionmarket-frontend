"use client";

import { use } from "react";
import { CasinoPage } from "@/components/dashboard/casino/casino-page";
import { SwissDetailSection } from "@/components/dashboard/casino/chess/swiss/detail-section";

export default function ChessSwissDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = use(params);
  const query = use(searchParams);
  return (
    <CasinoPage>
      <SwissDetailSection tournamentId={id} showCreatedShare={query.created === "1"} />
    </CasinoPage>
  );
}
