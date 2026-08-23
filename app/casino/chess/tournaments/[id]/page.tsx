"use client";

import { use } from "react";
import { ArenaDetailSection, CasinoPage } from "@/features/casino";

export default function ChessArenaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = use(params);
  const query = use(searchParams);
  return (
    <CasinoPage hideBackLink>
      <ArenaDetailSection arenaId={id} showCreatedShare={query.created === "1"} />
    </CasinoPage>
  );
}
