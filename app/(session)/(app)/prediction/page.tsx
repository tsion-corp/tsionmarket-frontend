"use client";

import { PredictionView } from "@/features/prediction";
import { useMarketHandoff } from "@/hooks/use-market-handoff";

// Prediction markets as their own page, like Earn and Casino. The auth guard
// and the app shell come from the (app) layout, with the Prediction tab
// derived from the path.
export default function PredictionPage() {
  const handingOff = useMarketHandoff("prediction");
  if (handingOff) return null;
  return <PredictionView />;
}
