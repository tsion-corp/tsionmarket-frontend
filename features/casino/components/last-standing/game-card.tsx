"use client";

import { memo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { truncateAddress } from "@/lib/format";
import { Countdown } from "@/features/casino/components/last-standing/countdown";
import { gameTitle } from "@/features/casino/lib/vault-game";
import type { VaultGame } from "@/features/casino/lib/vault-api";

interface GameCardProps {
  game: VaultGame;
  /** The signed-in wallet, so a game you are winning reads differently. */
  address: string | null;
  /** Formats a USD figure in the currency the user picked. */
  formatUsd: (usd: number) => string;
}

// A live game, in the 2.0 card language: one rounded surface, a ground that
// goes from ink to a warm shadow, and the clock as the loudest thing on it.
//
// Deliberately NOT the gold of the hero above. The hero is the game's poster
// and can be artwork; this is a row you scan several of, and a bright ground
// repeated down a list is noise. The amber is kept as the accent on the clock
// and the live dot, which ties the row to the identity without wearing it.
//
// The starter's name leads, because that is what tells two open games apart.
// Before naming shipped there was nothing here but "#252", which is why the
// number moved to a chip rather than being dropped: a deep link is still
// addressed by it.
function GameCardBase({ game, address, formatUsd }: GameCardProps) {
  const t = useTranslations("casino.lastStanding");
  const youAreKing = !!address && game.king.toLowerCase() === address.toLowerCase();
  const youStarted = !!address && game.starter.toLowerCase() === address.toLowerCase();
  const title = gameTitle(game, (id) => t("untitledGame", { id }));

  return (
    <Link
      href={`/casino/last-standing/${game.gameId}`}
      className="group relative flex items-stretch gap-4 overflow-hidden rounded-[18px] border border-white/8 bg-[linear-gradient(135deg,#0e1014_0%,#141119_58%,#1b1409_100%)] px-4 py-3.5 transition-colors hover:border-white/16 sm:px-5"
    >
      {/* The warm edge the clock sits against, so the right of the row reads
          as the urgent end without painting the whole card. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-[38%] bg-[radial-gradient(120%_100%_at_100%_50%,rgba(255,213,45,0.10)_0%,transparent_70%)]"
      />

      <span className="relative z-[1] flex min-w-0 flex-1 flex-col justify-center">
        <span className="flex flex-wrap items-center gap-1.5">
          {game.active ? (
            <span className="flex items-center gap-1.5 rounded-full bg-[#ffd52d]/12 px-2 py-0.5 text-[10px] font-semibold text-[#ffd52d]">
              <span className="size-1 animate-pulse rounded-full bg-[#ffd52d]" />
              {t("liveNow")}
            </span>
          ) : null}
          {youAreKing ? (
            <span className="bg-up/15 text-up rounded-full px-2 py-0.5 text-[10px] font-semibold">
              {t("youAreStanding")}
            </span>
          ) : null}
          {youStarted ? (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
              {t("youStarted")}
            </span>
          ) : null}
          <span className="tnum text-[11px] font-medium text-white/30">#{game.gameId}</span>
        </span>

        {/* The name leads. Unnamed games fall back to their number here rather
            than rendering an empty heading: on a redesigned row the headline
            is structural, unlike the old layout where it could be left out. */}
        <span className="mt-1.5 truncate text-[15px] leading-[1.25] font-semibold text-white">
          {title}
        </span>
        {game.description ? (
          <span className="mt-0.5 truncate text-[12px] leading-[1.4] font-normal text-white/45">
            {game.description}
          </span>
        ) : null}

        <span className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[10px] font-normal tracking-[0.07em] text-white/35 uppercase">
            {t("potLabel")}
          </span>
          <span className="ws-display text-[19px] leading-none tracking-[-0.01em] text-white">
            {formatUsd(game.pot.usdValue)}
          </span>
        </span>

        <span className="mt-1 truncate text-[11.5px] font-normal text-white/35">
          {t("startedBy", { who: youStarted ? t("you") : truncateAddress(game.starter) })} ·{" "}
          {t("lastPlayer")} {youAreKing ? t("you") : truncateAddress(game.king)}
        </span>
      </span>

      {/* The clock. Everything about this game is the clock, so it is the
          largest figure on the row and the only amber type. */}
      <span className="relative z-[1] flex shrink-0 flex-col items-end justify-center text-right">
        <Countdown
          endTime={game.endTime}
          expiredLabel={t("settling")}
          className="tnum block text-[24px] leading-none font-semibold text-[#ffd52d] tabular-nums"
        />
        <span className="mt-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-white/60">
          {t("toJoin", { amount: formatUsd(game.minWager.usdValue) })}
        </span>
      </span>
    </Link>
  );
}

export const GameCard = memo(GameCardBase);
