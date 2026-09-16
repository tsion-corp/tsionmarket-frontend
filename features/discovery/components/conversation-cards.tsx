"use client";

import { useTranslations } from "next-intl";
import type { LiveConversation } from "@/features/discovery/hooks/use-live-conversations";
import {
  ConversationCard,
  Dust,
  FaceScatter,
  KickerGlyph,
  KickerIcon,
  across,
  artLayer,
} from "@/features/discovery/components/conversation-card";

// The cards of the "Join the Conversation" band, which is Square and nothing
// else: the rooms that are live, the way into one of your own, and the feed.
// Each wears the shared frame in its own hue, with a motif drawn in CSS where
// the room cards scatter the faces of the people in them.
//
// A pill that DOES something on the Square, joining a room or starting one,
// leaves for the Square's deployment in a new tab, and the caller passes the
// address rather than the card assuming it. A pill that only OPENS the Square
// opens its page in this app, /square, in the same tab.

function Chevron() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowOut() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path
        d="M7 17 17 7M9 7h8v8"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The gold-to-bark fill the Marathon wordmark is lettered in. */
const WORDMARK_INK = "bg-gradient-to-r from-[#ac6900] to-[#462b00] bg-clip-text text-transparent";

/** The Square page in this app, where a pill that only opens the Square goes. */
const SQUARE_PAGE = "/square";

export interface SquareCardProps {
  /** The room on show, or null when nothing is live. */
  room: LiveConversation | null;
  /** Hosts' faces across every live room, for the scatter. */
  avatars: readonly string[];
  onHold?: (held: boolean) => void;
}

// Ink to teal. The motif is the chess card's own: the faces of the people in
// the rooms, live on Market Square. Joining a live room leaves for the
// square's deployment in a new tab; with nothing live the pill opens the
// Square page here.
export function SquareCard({ room, avatars, onHold }: SquareCardProps) {
  const t = useTranslations("discovery");
  const live = room !== null && room.href !== null;

  return (
    <ConversationCard
      gradient="bg-[linear-gradient(180deg,#02121a_0%,#1d9aa8_100%)]"
      art={
        <>
          <Dust />
          <FaceScatter avatars={avatars} />
        </>
      }
      kicker={{
        icon:
          live && room.avatars[0] ? (
            <KickerIcon src={room.avatars[0]} />
          ) : (
            <KickerIcon src="/market/convo-house-icon.png" />
          ),
        label: live && room.host ? t("squareLiveKicker", { host: room.host }) : t("squareKicker"),
      }}
      headline={live ? room.title : t("squareIdleHeadline")}
      action={
        live
          ? {
              href: room.href as string,
              label: t("squareJoin"),
              icon: <ArrowOut />,
              external: true,
            }
          : { href: SQUARE_PAGE, label: t("squareOpen"), icon: <Chevron /> }
      }
      onHold={onHold}
    />
  );
}

// Ink to rose. The motif is the on-air ring: a live dot with its halo, over
// the shape of a room being hosted rather than watched.
export function GoLiveCard({
  homeHref,
  onHold,
}: {
  homeHref: string;
  onHold?: (held: boolean) => void;
}) {
  const t = useTranslations("discovery");

  return (
    <ConversationCard
      gradient="bg-[linear-gradient(180deg,#1a0210_0%,#c02454_100%)]"
      art={
        <>
          <Dust />
          <span
            aria-hidden
            className={`${artLayer} top-[18px] grid size-[86px] place-items-center rounded-full border-[3px] border-white/70`}
            style={{ right: across(64) }}
          >
            <span className="size-[26px] rounded-full bg-white shadow-[0_0_22px_rgba(255,255,255,0.65)]" />
          </span>
          <span
            aria-hidden
            className={`${artLayer} top-[6px] size-[110px] rounded-full border border-white/25`}
            style={{ right: across(52) }}
          />
          <span
            className={`${artLayer} top-[16px] rounded-full bg-white/15 px-[9px] py-[3px] font-serif text-[11px] leading-none font-semibold text-white`}
            style={{ left: across(44.32) }}
          >
            <span className="mr-[5px] inline-block size-[6px] rounded-full bg-[#ff5d7a] align-middle" />
            {t("goLiveBadge")}
          </span>
        </>
      }
      kicker={{ icon: <KickerGlyph glyph="◉" />, label: t("goLiveKicker") }}
      headline={t("goLiveHeadline")}
      action={{
        href: homeHref,
        label: t("goLiveStart"),
        icon: <ArrowOut />,
        external: true,
      }}
      onHold={onHold}
    />
  );
}

// Ink to indigo. The motif is the feed itself: three posts stacked back into
// the card, the top one still being written.
const POSTS = [
  { top: 6, width: 132, opacity: 0.2 },
  { top: 34, width: 152, opacity: 0.35 },
  { top: 62, width: 118, opacity: 0.55 },
];

export function FeedCard({ onHold }: { onHold?: (held: boolean) => void }) {
  const t = useTranslations("discovery");

  return (
    <ConversationCard
      gradient="bg-[linear-gradient(180deg,#0b0620_0%,#4436c7_100%)]"
      art={
        <>
          <Dust />
          {POSTS.map((post) => (
            <span
              key={post.top}
              aria-hidden
              className={`${artLayer} h-[22px] rounded-[8px] bg-white`}
              style={{
                right: across(52),
                top: post.top,
                width: post.width,
                opacity: post.opacity,
              }}
            />
          ))}
          <span
            aria-hidden
            className={`${artLayer} top-[62px] h-[22px] w-[10px] rounded-[3px] bg-white/80`}
            style={{ right: across(176) }}
          />
        </>
      }
      kicker={{ icon: <KickerGlyph glyph="✦" />, label: t("feedKicker") }}
      headline={t("feedHeadline")}
      action={{ href: SQUARE_PAGE, label: t("feedOpen"), icon: <Chevron /> }}
      onHold={onHold}
    />
  );
}
