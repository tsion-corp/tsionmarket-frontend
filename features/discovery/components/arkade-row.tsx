"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Carousel } from "@/components/ui/carousel";
import {
  ArkBallCard,
  ArkjetCard,
  CheckersCard,
  ChessCard,
  LastManCard,
  PilotChickenCard,
} from "@/features/discovery/components/arkade-cards";
import { DiscoveryRow } from "@/features/discovery/components/discovery-row";
import { useCountdown } from "@/hooks/use-countdown";
import { useDashboardFeed } from "@/hooks/use-dashboard-feed";
import type { LiveRound } from "@/lib/dashboard-feed";

/** The open round with the most in it, or null when none is open. */
function richestRound(rounds: readonly LiveRound[] | undefined, nowSeconds: number) {
  let best: LiveRound | null = null;
  for (const round of rounds ?? []) {
    if (round.endTime <= nowSeconds) continue;
    if (best === null || round.potUsd > best.potUsd) best = round;
  }
  return best;
}

// The Arkade's shelf on the home page: one card per game, in the order the
// Arkade itself lists them. It used to share the conversation band with the
// Square rooms, which made a single row answer two different questions; the
// games have their own heading now, and the band beside it is Square alone.
//
// The live figures come from the dashboard feed, which the server composes
// once for everyone: the open round worth joining and how many checkers
// matches are being played. The countdown is read here rather than on the
// card, because the carousel draws each slide more than once and every copy
// must show the same clock.
export function ArkadeRow() {
  const t = useTranslations("discovery");

  // Every copy of every card reports its own hold, so this counts holds rather
  // than flagging one: a pointer can reach a second card before it has left
  // the first, and one release must not let go of the other's hold.
  const [holds, setHolds] = useState(0);
  const hold = useCallback((held: boolean) => setHolds((n) => n + (held ? 1 : -1)), []);

  // Rounds are read against the feed's own clock. A round that had ended by
  // the time the server composed the feed is not one to join; the countdown
  // catches one that ends after that.
  const feed = useDashboardFeed().data;
  const round = richestRound(feed?.live?.rounds, feed ? feed.asOf / 1000 : 0);
  const remainingMs = useCountdown(round ? round.endTime * 1000 : null);
  const checkersLive = feed?.live?.checkers.length ?? 0;

  return (
    <DiscoveryRow
      title={t.rich("arkadeTitle", {
        accent: (chunks) => <span className="text-[#f6d37a]">{chunks}</span>,
      })}
      href="/casino"
    >
      <Carousel label={t("arkadeCarousel")} gapPx={20} trimPx={50}>
        <LastManCard round={round} remainingMs={remainingMs} onHold={hold} />
        <ChessCard onHold={hold} />
        <ArkBallCard onHold={hold} />
        <CheckersCard liveCount={checkersLive} onHold={hold} />
        <ArkjetCard onHold={hold} />
        <PilotChickenCard onHold={hold} />
      </Carousel>
    </DiscoveryRow>
  );
}
