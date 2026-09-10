"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Carousel } from "@/components/ui/carousel";
import {
  ConversationCard,
  FaceScatter,
  KickerIcon,
  artLayer,
} from "@/features/discovery/components/conversation-card";
import {
  ArkBallCard,
  CheckersCard,
  LastManCard,
  SquareCard,
} from "@/features/discovery/components/conversation-cards";
import { DiscoveryRow } from "@/features/discovery/components/discovery-row";
import { useLiveConversations } from "@/features/discovery/hooks/use-live-conversations";
import type { SpaceSpot } from "@/features/discovery/types";
import { useCountdown } from "@/hooks/use-countdown";
import { useDashboardFeed } from "@/hooks/use-dashboard-feed";
import { useRotatingIndex } from "@/hooks/use-rotating-index";
import type { LiveRound } from "@/lib/dashboard-feed";
import { MARKET_SQUARE_HIDDEN, marketSquareHref } from "@/lib/market-square";

interface ChessRoomCardProps {
  room: SpaceSpot;
  onHold: (held: boolean) => void;
}

// The square's chess room: the card the band was drawn around. Ink to violet,
// the chess art across the top, and the members' faces scattered over it.
function ChessRoomCard({ room, onHold }: ChessRoomCardProps) {
  const t = useTranslations("discovery");

  return (
    <ConversationCard
      gradient="bg-[linear-gradient(180deg,#140027_0%,#6023c2_100%)]"
      art={
        <>
          <img
            src="/market/convo-chess-art.svg"
            alt=""
            aria-hidden
            width={482}
            height={203}
            className={`${artLayer} inset-0 h-full w-full`}
          />
          <FaceScatter avatars={room.avatars} />
        </>
      }
      kicker={{ icon: <KickerIcon src="/market/convo-house-icon.png" />, label: room.room }}
      headline={room.headline}
      primary={{
        href: room.href,
        label: t("conversationJoin"),
        icon: (
          <img
            src="/market/convo-icon-volume.svg"
            alt=""
            aria-hidden
            width={9}
            height={7}
            className="h-[7.465px] w-[9.17px] shrink-0"
          />
        ),
      }}
      secondary={{
        href: room.actionHref,
        label: t("conversationPlay"),
        icon: (
          <img
            src="/market/convo-icon-pawn.svg"
            alt=""
            aria-hidden
            width={7}
            height={9}
            className="h-[9.17px] w-[7.463px] shrink-0"
          />
        ),
      }}
      onHold={onHold}
    />
  );
}

/** The open round with the most in it, or null when none is open. */
function richestRound(rounds: readonly LiveRound[] | undefined, nowSeconds: number) {
  let best: LiveRound | null = null;
  for (const round of rounds ?? []) {
    if (round.endTime <= nowSeconds) continue;
    if (best === null || round.potUsd > best.potUsd) best = round;
  }
  return best;
}

// "Join the Conversation": one heading, and under it the places on this app
// where something is happening right now. The chess room first, as drawn, then
// the Last Man round, the rooms live on Market Square, Checkers and ArkBall.
// Every card is a doorway: the heading leads to the square itself, and the two
// pills on each card lead into the game or the room.
//
// The chess room and the square room both rotate through whatever is live. The
// rotations are owned here rather than on the cards because the carousel draws
// each slide more than once and every copy must show the same room.
export function ConversationRow({ spaces = [] }: { spaces?: readonly SpaceSpot[] }) {
  const t = useTranslations("discovery");

  // Every copy of every card reports its own hold, so this counts holds rather
  // than flagging one: a pointer can reach a second card before it has left
  // the first, and one release must not let go of the other's hold.
  const [holds, setHolds] = useState(0);
  const hold = useCallback((held: boolean) => setHolds((n) => n + (held ? 1 : -1)), []);
  const paused = holds > 0;

  // The room the design draws, from the discovery copy and the committed
  // photos. It is what the chess card shows when the route has nothing live to
  // give it, and a single room does not rotate.
  const chessRoom: SpaceSpot = {
    id: "chess",
    room: t("conversationRoom"),
    headline: t("conversationHeadline"),
    avatars: [],
    href: "/casino/chess/watch",
    actionHref: "/casino/chess",
  };
  const rooms = spaces.length > 0 ? spaces : [chessRoom];
  const room = rooms[useRotatingIndex(rooms.length, { paused })];

  // Rounds are read against the feed's own clock. A round that had ended by
  // the time the server composed the feed is not one to join; the countdown
  // below catches one that ends after that.
  const feed = useDashboardFeed().data;
  const round = richestRound(feed?.live?.rounds, feed ? feed.asOf / 1000 : 0);
  const remainingMs = useCountdown(round ? round.endTime * 1000 : null);
  const checkersLive = feed?.live?.checkers.length ?? 0;

  const conversations = useLiveConversations();
  const conversation = conversations[useRotatingIndex(conversations.length, { paused })] ?? null;
  const hosts = conversations.flatMap((live) => live.avatars).slice(0, 6);
  const squareHome = marketSquareHref();

  return (
    <DiscoveryRow
      title={t("conversationTitle")}
      href={squareHome ?? "/casino/chess"}
      external={squareHome !== null}
    >
      <Carousel label={t("conversationCarousel")} gapPx={20} trimPx={50}>
        <ChessRoomCard room={room} onHold={hold} />
        <LastManCard round={round} remainingMs={remainingMs} onHold={hold} />
        {/* A hidden square has no rooms and no deployment to link to, so the
            card goes rather than standing with dead pills. */}
        {!MARKET_SQUARE_HIDDEN && squareHome !== null ? (
          <SquareCard room={conversation} avatars={hosts} homeHref={squareHome} onHold={hold} />
        ) : null}
        <CheckersCard liveCount={checkersLive} onHold={hold} />
        <ArkBallCard onHold={hold} />
      </Carousel>
    </DiscoveryRow>
  );
}
