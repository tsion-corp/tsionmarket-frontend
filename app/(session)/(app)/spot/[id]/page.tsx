"use client";

import { use } from "react";
import { SpotTokenDetail } from "@/features/trade/components/spot-token-detail";

// One spot token: chart, stats and a Buy action, on its own page rather than in
// a popup. The auth guard and the app shell come from the (app) layout.
export default function SpotTokenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SpotTokenDetail id={id} />;
}
