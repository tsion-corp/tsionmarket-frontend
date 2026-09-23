"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Carousel } from "@/components/ui/carousel";
import {
  FeedCard,
  GoLiveCard,
  SquareCard,
} from "@/features/discovery/components/conversation-cards";
import { DiscoveryRow } from "@/features/discovery/components/discovery-row";
import { useLiveConversations } from "@/features/discovery/hooks/use-live-conversations";
import { useRotatingIndex } from "@/hooks/use-rotating-index";
import { MARKET_SQUARE_HIDDEN, marketSquareHref } from "@/lib/market-square";

// "Join the Conversation": one heading, and under it Square, which is what
// the band is for. The rooms that are live, the way into one of your own, and
// the feed. The Arkade's games used to sit here too; they have their own shelf
// beside this one, so neither row has to answer two questions at once.
//
// The band used to lead with a chess room card the design was drawn around.
// Nothing ever supplied it with a real room, so it always fell back to a fixed
// headline pointing at /casino/chess/watch, which does not resolve. A card that
// only ever led somewhere broken is worse than no card, so it is gone and the
// band starts with the square's own rooms.
//
// The square room rotates through whatever is live. The rotation is owned here
// rather than on the card because the carousel draws each slide more than once
// and every copy must show the same room.
export function ConversationRow() {
  const t = useTranslations("discovery");

  // Every copy of every card reports its own hold, so this counts holds rather
  // than flagging one: a pointer can reach a second card before it has left
  // the first, and one release must not let go of the other's hold.
  const [holds, setHolds] = useState(0);
  const hold = useCallback((held: boolean) => setHolds((n) => n + (held ? 1 : -1)), []);
  const paused = holds > 0;

  const conversations = useLiveConversations();
  const conversation = conversations[useRotatingIndex(conversations.length, { paused })] ?? null;
  const hosts = conversations.flatMap((live) => live.avatars).slice(0, 6);
  const squareHome = marketSquareHref();

  // A hidden square has no rooms and no deployment to link to, and the square's
  // cards are now the only cards the band has. Nothing to deal means no band,
  // rather than a heading over an empty rail.
  if (MARKET_SQUARE_HIDDEN || squareHome === null) return null;

  return (
    <DiscoveryRow title={t("conversationTitle")} href={squareHome}>
      <Carousel label={t("conversationCarousel")} gapPx={20} trimPx={50}>
        <SquareCard room={conversation} avatars={hosts} onHold={hold} />
        <GoLiveCard homeHref={squareHome} onHold={hold} />
        <FeedCard onHold={hold} />
      </Carousel>
    </DiscoveryRow>
  );
}
