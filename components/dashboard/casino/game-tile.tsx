"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CasinoGame, TileSize } from "@/lib/casino/games";
import type { GamePresence } from "@/lib/casino/api/types";

// A next-intl t scoped to "casino.hub", passed into the label helpers.
type HubTranslate = (key: string, values?: Record<string, string | number>) => string;

// Tailwind needs static class strings, so each tile footprint maps to a
// literal span/height combo on the hub's 6-column grid.
const SIZE_CLASS: Record<TileSize, string> = {
  hero: "col-span-6 md:col-span-4 min-h-[220px] md:min-h-[290px]",
  tall: "col-span-6 sm:col-span-3 md:col-span-2 min-h-[200px] md:min-h-[290px]",
  medium: "col-span-3 md:col-span-2 min-h-[176px]",
  wide: "col-span-6 sm:col-span-3 min-h-[120px]",
};

const MOTIF_SIZE: Record<TileSize, string> = {
  hero: "text-[150px]",
  tall: "text-[120px]",
  medium: "text-[90px]",
  wide: "text-[64px]",
};

const TITLE_SIZE: Record<TileSize, string> = {
  hero: "text-[28px]",
  tall: "text-[20px]",
  medium: "text-[19px]",
  wide: "text-[17px]",
};

interface GameTileProps {
  game: CasinoGame;
  // Live figures for this game, absent until the presence API answers.
  presence?: GamePresence;
  // The game's headline figure already formatted in the viewer's currency.
  headline?: string;
}

// Turns live presence into the small status line on the tile. A game with
// nobody in it says so honestly rather than inventing activity.
function presenceLine(
  t: HubTranslate,
  game: CasinoGame,
  presence?: GamePresence
): { dot: string; text: string; label: string } | null {
  if (game.comingSoon) return null;
  if (!presence) return null;
  if (presence.playersOnline > 0) {
    return {
      dot: "bg-up",
      text: "text-up",
      label: t("presencePlaying", { count: presence.playersOnline.toLocaleString() }),
    };
  }
  if (presence.inQueue > 0) {
    return {
      dot: "bg-grey-300",
      text: "text-grey-300",
      label: t("presenceQueue", { count: presence.inQueue.toLocaleString() }),
    };
  }
  return { dot: "bg-white/40", text: "text-white/50", label: t("presenceBeFirst") };
}

function badgeFor(t: HubTranslate, game: CasinoGame, presence?: GamePresence) {
  if (game.comingSoon)
    return { text: t("badgeComingSoon"), className: "bg-white/12 text-white/70" };
  if (presence && presence.playersOnline > 0)
    return { text: t("badgePopular"), className: "bg-accent text-ink" };
  if (game.category === "New" || game.isNew)
    return { text: t("badgeNew"), className: "bg-grey-100 text-ink" };
  return null;
}

export function GameTile({ game, presence, headline }: GameTileProps) {
  const t = useTranslations("casino.hub");
  const badge = badgeFor(t, game, presence);
  const line = presenceLine(t, game, presence);
  const hasArrow = !game.comingSoon && (game.size === "hero" || game.size === "tall");

  const body = (
    <>
      {game.image ? (
        // Cover art under a per-game tint and the legibility scrim.
        <span aria-hidden className="pointer-events-none absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={game.image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
          {game.tintRgb ? (
            <span
              className="absolute inset-0"
              style={{
                background: `linear-gradient(135deg, rgb(${game.tintRgb} / 0.38), rgb(${game.tintRgb} / 0.08) 55%, transparent)`,
                mixBlendMode: "hard-light",
              }}
            />
          ) : null}
        </span>
      ) : (
        // Glyph motif for games with no artwork yet.
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_70%_20%,rgba(212,212,216,0.08),transparent_60%)]"
        >
          <span
            className={`ws-display -rotate-8 leading-none select-none ${MOTIF_SIZE[game.size]} ${
              game.comingSoon ? "text-white/5" : "text-white/9"
            }`}
          >
            {game.glyph}
          </span>
        </span>
      )}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${
          game.image
            ? "bg-[linear-gradient(to_top,rgba(0,0,0,0.82)_0%,rgba(0,0,0,0.34)_46%,rgba(0,0,0,0.08)_75%)]"
            : "bg-[linear-gradient(to_top,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.16)_50%,transparent_75%)]"
        }`}
      />

      {badge ? (
        <span
          className={`absolute top-3 left-3 rounded-md px-2.5 py-1 text-[10px] font-bold tracking-[0.05em] ${badge.className}`}
        >
          {badge.text}
        </span>
      ) : null}

      {line ? (
        <span className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-2.5 py-1 backdrop-blur-md">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${line.dot}`} />
          <span className={`tnum text-[10.5px] whitespace-nowrap ${line.text}`}>{line.label}</span>
        </span>
      ) : null}

      <span className="absolute right-0 bottom-0 left-0 flex items-end justify-between gap-2.5 p-4">
        <span className="min-w-0">
          <span
            className={`ws-display block leading-[1.1] ${TITLE_SIZE[game.size]} ${
              game.comingSoon ? "text-white/50" : "text-white"
            }`}
          >
            {t(`games.${game.id}.name`)}
          </span>
          {headline ? (
            <span className="ws-display tnum text-grey-100 mt-1 block text-[25px]">{headline}</span>
          ) : null}
          {game.note ? (
            <span className="mt-1 block truncate text-[11.5px] font-normal text-white/60">
              {t(`games.${game.id}.note`)}
            </span>
          ) : null}
        </span>
        {hasArrow ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/18 text-[14px] text-white">
            →
          </span>
        ) : null}
      </span>
    </>
  );

  const frame = `ws-glass group relative overflow-hidden rounded-[18px] text-left transition-[transform,border-color] duration-150 ${SIZE_CLASS[game.size]}`;

  if (game.comingSoon || !game.href) {
    return <div className={`${frame} opacity-60`}>{body}</div>;
  }
  return (
    <Link
      href={game.href}
      className={`${frame} hover:border-accent/60 cursor-pointer hover:-translate-y-0.5`}
    >
      {body}
    </Link>
  );
}
