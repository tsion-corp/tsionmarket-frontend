"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LichessGameEmbed } from "@/features/casino/components/chess-app/lichess-embed";

function EmbedFromParams() {
  const params = useSearchParams();
  return (
    <LichessGameEmbed
      matchId={params.get("match")}
      orientation={params.get("orientation") === "black" ? "black" : "white"}
    />
  );
}

export default function ChessEmbedPage() {
  return (
    <Suspense fallback={null}>
      <EmbedFromParams />
    </Suspense>
  );
}
