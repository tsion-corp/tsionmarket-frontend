"use client";

import { use } from "react";
import { EventDetail } from "@/features/prediction";
import {
  isPredictionMarketCategory,
  parsePredictionCategory,
} from "@/features/prediction/categories";
import { DiscoveryEventDetail } from "@/features/prediction/components/trending-event-detail";

// One multi-outcome EVENT (Polymarket-style grouped market): the candidate/
// outcome list, context + rules, and event comments. `id` is the group id or
// slug. The auth guard and the app shell come from the (app) layout.
export default function PredictionEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = use(params);
  const query = use(searchParams);
  const category = parsePredictionCategory(
    typeof query.category === "string" ? query.category : undefined
  );
  if (query.source === "markets" && isPredictionMarketCategory(category)) {
    return <DiscoveryEventDetail eventId={id} category={category} />;
  }
  return <EventDetail idOrSlug={id} />;
}
