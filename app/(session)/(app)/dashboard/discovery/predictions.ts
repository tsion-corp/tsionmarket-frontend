"use client";

import { useMemo, useState } from "react";
import { usePredictions } from "@/features/prediction/hooks/use-predictions";
import { parseCloseTime } from "@/hooks/use-countdown";
import type { Prediction } from "@/lib/types";
import type { PredictionSpot } from "@/features/discovery/types";

// Adapter between the prediction feed and the "prediction starts" card, the
// third sibling of memecoins.ts and tokens.ts and built to the same rules:
// discovery may not import prediction, so the route calls the prediction
// slice's own hook and hands the card a display-ready shape.
//
// Until this existed the card had no data source at all. The dashboard mounted
// <PredictionStartsRow /> with no markets prop, so the rotation had nothing to
// rotate and the card showed the design's sample market forever, under a
// countdown that was a clock face typed into the message catalogue. The same
// defect as the token card next to it, found the same way.

const DEFAULT_LIMIT = 5;

// One shared empty result, so a feed that is loading, failed, or has nothing
// showable hands the card the same array every render and does not restart the
// ten second rotation.
const NO_SPOTS: readonly PredictionSpot[] = Object.freeze([]);

/**
 * One market as the card shows it, or null when the card will not show it.
 *
 * A market with no question has no headline, which is the whole card, so it is
 * dropped rather than drawn empty.
 */
function toSpot(prediction: Prediction): PredictionSpot | null {
  const question = prediction.q?.trim() ?? "";
  if (question === "") return null;

  // The event id is the market's identity here. Without one the card cannot be
  // keyed stably across a refetch and cannot open anything either.
  const id = prediction.eventId;
  if (!id) return null;

  return {
    id,
    question,
    // Raw instant, ticked by the card. Null when Gamma published no end date,
    // which the chip renders as "No deadline".
    closesAt: parseCloseTime(prediction.endsAt),
    // The collage takes two and the feed gives one per market, so the card
    // draws what there is. An absent image yields no tile rather than a
    // placeholder standing in for artwork that does not exist.
    images: prediction.image ? [prediction.image] : [],
    // A Polymarket market has no page of its own on this build, so the card
    // opens the prediction desk, where it can be bet on.
    href: "/prediction",
  };
}

function sameSpots(a: readonly PredictionSpot[], b: readonly PredictionSpot[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((left, index) => {
    const right = b[index];
    return (
      left.id === right.id &&
      left.question === right.question &&
      left.closesAt === right.closesAt &&
      left.href === right.href &&
      left.images.length === right.images.length &&
      left.images.every((image, i) => image === right.images[i])
    );
  });
}

/**
 * The markets the "prediction starts" card cycles through.
 *
 * Returns at most `limit`, in the order the feed ranked them, which is by 24h
 * volume. No sorting of our own: the card is a showcase, and the feed's own
 * ranking is a better answer than any ordering invented here.
 */
export function usePredictionSpots(limit: number = DEFAULT_LIMIT): readonly PredictionSpot[] {
  const { data } = usePredictions();

  const spots = useMemo(() => {
    if (limit <= 0) return NO_SPOTS;
    const rows = (data ?? [])
      .map(toSpot)
      .filter((spot): spot is PredictionSpot => spot !== null)
      .slice(0, limit);
    return rows.length === 0 ? NO_SPOTS : rows;
  }, [data, limit]);

  // A refetch hands back a fresh array whether or not anything changed, and a
  // fresh array is a fresh set of cards as far as the row is concerned, which
  // would restart the ten second rotation mid-cycle. So the last result is held
  // and returned again while the new one matches it field for field. React's
  // own adjust-state-during-render pattern: the set below re-renders before
  // anything is painted, and only when the markets really changed.
  const [held, setHeld] = useState(spots);
  let shown = held;
  if (!sameSpots(held, spots)) {
    setHeld(spots);
    shown = spots;
  }
  return shown;
}
