"use client";

import { ActivityView } from "@/features/activity";
import { useGameActivity } from "@/features/casino/hooks/use-game-activity";

// Transaction history as its own page, like Earn and Prediction. The auth guard
// and the app shell come from the (app) layout.
//
// The route is the composition point: it pulls the off-chain arcade plays from
// the casino feature and hands them to the activity view, which merges them with
// the on-chain feed (features never import each other). A game-activity poll
// re-renders this page only; the shell around it lives in the layout.
export default function ActivityPage() {
  const games = useGameActivity();
  return <ActivityView gameEntries={games.items} />;
}
