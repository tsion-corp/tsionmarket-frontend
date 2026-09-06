"use client";

import { use } from "react";
import { EventDetail } from "@/features/prediction";

// One multi-outcome EVENT (Polymarket-style grouped market): the candidate/
// outcome list, context + rules, and event comments. `id` is the group id or
// slug. The auth guard and the app shell come from the (app) layout.
export default function PredictionEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EventDetail idOrSlug={id} />;
}
