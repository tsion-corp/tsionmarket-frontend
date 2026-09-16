"use client";

import { useTranslations } from "next-intl";
import { squareLinks } from "@/lib/square/links";
import { SquareAvatar } from "@/features/square/components/square-avatar";
import {
  IconRoomBadgeMic,
  IconSpark,
  IconVoiceMode,
  TOPIC_ICONS,
} from "@/features/square/components/square-home-icons";
import { SQUARE_RAMP } from "@/features/square/components/square-outbound-link";
import type { MarketSquareRoom, MarketSquareTopic } from "@/lib/api/market-square";

// The three face tiles at the card's right, at the offsets the Square stacks
// them (market-square-frontend/components/layout/gist-room-card.tsx, TILES).
const TILES = [
  { left: 12.31, top: 0, size: 32, rotate: 0, ring: 1.668 },
  { left: 38.27, top: 21.47, size: 34.15, rotate: -4, ring: 1.668 },
  { left: 0, top: 20.97, size: 34.15, rotate: 4, ring: 1.334 },
] as const;

/**
 * A room live now, the Square's own invite card
 * (market-square-frontend/components/layout/gist-room-card.tsx, node
 * 225:3873) carried over: 338 by 120 of the Square's glass, the mic badge
 * before a fixed two-line title, up to two topic chips, "Join Gistroom" on
 * the purple ramp with the voice glyph, and the faces at the right.
 *
 * What is not here is the Square's hover preview, which listens to the
 * room's audio through its LiveKit session; this app has no room session,
 * so the card is the file's resting state. Joining is the Square's, so the
 * pill leaves for the room there.
 */
export function SquareGistRoomCard({
  room,
  topics,
}: {
  room: MarketSquareRoom;
  /** The Square's vocabulary, to label a topic key; the key stands in without it. */
  topics: MarketSquareTopic[];
}) {
  const t = useTranslations("square");
  const labelled = room.topics.slice(0, 2).map((key) => ({
    key,
    label: topics.find((topic) => topic.key === key)?.label ?? key,
    Icon: TOPIC_ICONS[key] ?? IconSpark,
  }));
  const faces = room.owner ? [room.owner] : [];
  const href = squareLinks.live(room.id);

  return (
    <article
      aria-label={room.title}
      className="flex w-[338px] max-w-full shrink-0 snap-start items-center justify-between gap-4 rounded-[22px] bg-[rgba(16,16,18,0.62)] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] backdrop-blur-[7px]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex h-8 gap-2">
          <IconRoomBadgeMic className="h-6 w-6 shrink-0 self-center" />
          <p className="line-clamp-2 min-w-0 flex-1 text-[12px] leading-4 font-semibold text-white">
            {room.title}
          </p>
        </div>

        <div className="mt-2 space-y-3 pl-8">
          {labelled.length > 0 ? (
            <div className="flex h-4 flex-wrap items-center gap-x-1 gap-y-4 overflow-hidden">
              {labelled.map(({ key, label, Icon }) => (
                <span
                  key={key}
                  className="text-grey-100 flex h-4 items-center gap-1 rounded-full bg-white/10 px-2 text-[9px] leading-3 font-bold"
                >
                  <Icon className="h-2.5 w-2.5" />
                  {label}
                </span>
              ))}
            </div>
          ) : null}

          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: SQUARE_RAMP }}
              className="ws-pressable flex h-5 w-fit items-center gap-[3px] rounded-[30px] px-3 text-[11px] leading-none font-medium text-white transition-opacity hover:opacity-90"
            >
              {t("joinRoom")}
              <IconVoiceMode className="h-[11px] w-[11px]" />
            </a>
          ) : null}
        </div>
      </div>

      {faces.length > 0 ? (
        <div aria-hidden className="relative h-[55.62px] w-[72.43px] shrink-0">
          {faces.map((face, index) => {
            const tile = TILES[index];
            return (
              <span
                key={face.id}
                className="absolute rounded-[10.675px] bg-white shadow-[0_4px_15px_0_rgba(147,147,147,0.25)]"
                style={{
                  left: tile.left,
                  top: tile.top,
                  width: tile.size,
                  height: tile.size,
                  padding: tile.ring,
                  transform: `rotate(${tile.rotate}deg)`,
                }}
              >
                <span
                  className="block h-full w-full overflow-hidden bg-[#EDEDED]"
                  style={{ borderRadius: 10.675 - tile.ring }}
                >
                  <SquareAvatar
                    src={face.avatarUrl}
                    seed={face.id}
                    name={face.displayName}
                    size={tile.size - tile.ring * 2}
                    shape="fill"
                  />
                </span>
              </span>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
