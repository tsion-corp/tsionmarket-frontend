"use client";

import { memo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { truncateAddress } from "@/lib/format";
import { Countdown } from "@/features/casino/components/last-standing/countdown";
import type { VaultGame } from "@/features/casino/lib/vault-api";

interface GameCardProps {
  game: VaultGame;
  /** The signed-in wallet, so a game you are winning reads differently. */
  address: string | null;
  /** Formats a USD figure in the currency the user picked. */
  formatUsd: (usd: number) => string;
}

// Memoised on the game itself. The lobby re-renders whenever any game's pot
// moves, and without this every row would re-render for a change in one of
// them. The countdown inside never re-renders at all: it writes its own text.
function GameCardBase({ game, address, formatUsd }: GameCardProps) {
  const t = useTranslations("casino.lastStanding");
  const youAreKing = !!address && game.king.toLowerCase() === address.toLowerCase();
  const youStarted = !!address && game.starter.toLowerCase() === address.toLowerCase();

  return (
    <Link
      href={`/casino/last-standing/${game.gameId}`}
      className="ws-inset group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.06]"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="tnum text-[12px] font-semibold text-white/40">#{game.gameId}</span>
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
        </span>
        {/* The pot is what someone is deciding whether to join for, so it is
            labelled rather than left as a bare figure next to the entry price. */}
        <span className="mt-1.5 block text-[10.5px] font-normal tracking-[0.06em] text-white/35 uppercase">
          {t("potLabel")}
        </span>
        <span className="ws-display block text-[19px] tracking-[-0.01em]">
          {formatUsd(game.pot.usdValue)}
        </span>
        <span className="mt-1 block truncate text-[12px] font-normal text-white/45">
          {t("startedBy", { who: youStarted ? t("you") : truncateAddress(game.starter) })} ·{" "}
          {t("lastPlayer")} {youAreKing ? t("you") : truncateAddress(game.king)}
        </span>
      </span>

      <span className="shrink-0 text-right">
        <Countdown
          endTime={game.endTime}
          expiredLabel={t("settling")}
          className="tnum block text-[17px] font-semibold text-white tabular-nums"
        />
        <span className="mt-0.5 block text-[11.5px] font-normal text-white/40">
          {t("toJoin", { amount: formatUsd(game.minWager.usdValue) })}
        </span>
      </span>
    </Link>
  );
}

export const GameCard = memo(GameCardBase);
