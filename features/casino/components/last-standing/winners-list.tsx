"use client";

import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { Pager } from "@/components/ui/pager";
import { useMoney } from "@/components/ui/currency-select";
import { usePaged } from "@/hooks/use-paged";
import { timeAgo, truncateAddress } from "@/lib/format";
import type { VaultWinner } from "@/features/casino/lib/vault-api";

const EXPLORER_ADDRESS_URL = "https://basescan.org/address/";

interface WinnersListProps {
  winners: VaultWinner[];
  loading?: boolean;
  /** Empty-state line, when there is nothing to list. */
  emptyLabel: string;
  /** Marks the newest row as the latest result, with the light sweep. */
  highlightLatest?: boolean;
  /** Rows per page. A modal on a phone wants fewer, so its close stays in reach. */
  pageSize?: number;
  /** Two columns on wide screens (the game page card), or one (a modal). */
  columns?: 1 | 2;
}

// The settled rounds, newest first: who won, which game, when, and what they
// were paid. One list for the game page (scoped to that game) and the lobby's
// history (every game), so a winner's row reads the same everywhere. The
// amount is what settle() sent that wallet, the starter's share included when
// the winner opened the game.
export function WinnersList({
  winners,
  loading = false,
  emptyLabel,
  highlightLatest = true,
  pageSize = 10,
  columns = 2,
}: WinnersListProps) {
  const t = useTranslations("casino.lastStanding");
  const money = useMoney();
  const reduce = useReducedMotion();
  const paged = usePaged(winners, pageSize);
  const grid = columns === 2 ? "mt-4 grid gap-2 sm:grid-cols-2 sm:gap-x-5" : "mt-4 grid gap-2";

  if (loading) {
    return (
      <div className={grid}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[52px] animate-pulse rounded-[14px] bg-white/6" />
        ))}
      </div>
    );
  }

  if (winners.length === 0) {
    return (
      <div className="grid place-items-center py-12 text-center text-[13px] font-normal text-white/40">
        {emptyLabel}
      </div>
    );
  }

  return (
    <>
      <div className={grid}>
        {paged.pageItems.map((w, idx) => {
          const isLatest = highlightLatest && paged.page === 0 && idx === 0;
          return (
            <motion.a
              key={w.settlementTx}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.04, 0.3), duration: 0.28 }}
              href={`${EXPLORER_ADDRESS_URL}${w.winner}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`relative flex items-center gap-3 overflow-hidden rounded-[14px] px-3 py-2.5 transition-colors ${
                isLatest
                  ? "bg-[linear-gradient(110deg,rgba(216, 216, 220, 0.14),rgba(216, 216, 220, 0.02))] ring-1 ring-[#d8d8dc]/25"
                  : "bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              {isLatest && !reduce ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent)]"
                  animate={{ x: ["0%", "360%"] }}
                  transition={{
                    duration: 2.8,
                    repeat: Infinity,
                    repeatDelay: 1.8,
                    ease: "easeInOut",
                  }}
                />
              ) : null}
              <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#d8d8dc]/12 text-[15px] ring-1 ring-[#d8d8dc]/20">
                🏆
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="tnum block truncate text-[13.5px] font-semibold text-white/90">
                  {truncateAddress(w.winner)}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] font-normal text-white/45">
                  {`#${w.gameId} · `}
                  {timeAgo(w.settledAt)}
                </span>
              </span>
              <span className="relative shrink-0 text-right">
                <span className="tnum block text-[14px] font-bold text-[#d8d8dc]">
                  {money.format(w.toWinner.usdValue)}
                </span>
                {isLatest ? (
                  <span className="block text-[9.5px] font-semibold tracking-[0.12em] text-[#d8d8dc]/70 uppercase">
                    {t("latest")}
                  </span>
                ) : null}
              </span>
            </motion.a>
          );
        })}
      </div>
      {paged.total > pageSize ? (
        <Pager
          from={paged.from}
          to={paged.to}
          total={paged.total}
          canPrev={paged.canPrev}
          canNext={paged.canNext}
          onPrev={paged.goPrev}
          onNext={paged.goNext}
          label={t("pagerWinners")}
        />
      ) : null}
    </>
  );
}
