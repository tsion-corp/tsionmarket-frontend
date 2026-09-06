"use client";

import { use } from "react";
import { MarketDetail } from "@/features/prediction";

// One prediction market: chart, trade tape, execution and liquidity panels. The
// auth guard and the app shell come from the (app) layout.
export default function PredictionMarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MarketDetail id={id} />;
}
