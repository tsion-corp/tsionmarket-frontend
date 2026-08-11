"use client";

import { use } from "react";
import { CasinoPage, SwissDetailSection } from "@/features/casino";

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
