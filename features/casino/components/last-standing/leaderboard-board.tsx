"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Pager } from "@/components/ui/pager";
import { SquareAvatar } from "@/components/ui/square-avatar";
import { useMoney } from "@/components/ui/currency-select";
import { useSquareAvatar } from "@/hooks/use-square-avatar";
import { usePaged } from "@/hooks/use-paged";
import { truncateAddress } from "@/lib/format";
import type { LeaderboardEntry } from "@/features/casino/lib/last-standing/leaderboard";

const PAGE_SIZE = 10;

// The medal ranks. Below third a plain number reads better than a fourth
// colour nobody can name.
const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

interface LeaderboardBoardProps {
  rows: LeaderboardEntry[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** The reader's own wallet, so their row can be marked and named. */
  address?: string | null;
  /** The reader's own display name, shown on their row only. */
  selfName?: string | null;
}

/**
 * The all-time board: one row per wallet, ranked by everything it has won.
 *
 * Only the reader's own row carries a name and a face. Every other player is
 * an address: this is a public board on a public chain, and putting someone
 * else's profile against their winnings is not ours to do.
 */
export function LeaderboardBoard({
  rows,
  loading,
  error,
  onRetry,
  address,
  selfName,
}: LeaderboardBoardProps) {
  const t = useTranslations("casino.lastStanding");
  const money = useMoney();
  const selfAvatar = useSquareAvatar();
  const mine = address?.toLowerCase() ?? null;

  const paged = usePaged(rows, PAGE_SIZE);

  // Where the reader sits overall, so someone outside the visible page still
  // learns their rank rather than paging through 244 wallets to find it.
  const myRank = useMemo(() => {
    if (!mine) return null;
    const index = rows.findIndex((row) => row.address.toLowerCase() === mine);
    return index < 0 ? null : index + 1;
  }, [rows, mine]);

  if (loading) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="ws-inset h-[62px] animate-pulse bg-white/[0.03]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="ws-inset mt-4 px-4 py-8 text-center">
        <p className="text-[13.5px] font-normal text-white/60">{t("leaderboardError")}</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-accent mt-2 cursor-pointer text-[13px] font-semibold hover:underline"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="ws-inset mt-4 px-4 py-10 text-center">
        <p className="text-[14px] font-medium text-white">{t("leaderboardEmptyTitle")}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed font-normal text-white/55">
          {t("leaderboardEmptyBody")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12.5px] font-normal text-white/45">
          {t("leaderboardCount", { players: rows.length })}
        </p>
        {myRank !== null ? (
          <p className="tnum text-accent text-[12.5px] font-semibold">
            {t("leaderboardYourRank", { rank: myRank })}
          </p>
        ) : null}
      </div>

      <ol className="mt-3 flex flex-col gap-2">
        {paged.pageItems.map((row, index) => {
          const rank = paged.start + index + 1;
          const isMe = mine !== null && row.address.toLowerCase() === mine;
          return (
            <li
              key={row.address}
              className={
                "ws-inset flex items-center gap-3 px-3.5 py-3 transition-colors sm:px-4 " +
                (isMe ? "border-accent/40 bg-accent/[0.07]" : "")
              }
            >
              {/* Rank. Tabular so the column does not jitter between pages. */}
              <span
                className={
                  "tnum w-8 shrink-0 text-center text-[15px] font-semibold " +
                  (rank <= 3 ? "text-[17px]" : "text-white/40")
                }
              >
                {MEDALS[rank] ?? rank}
              </span>

              {isMe ? (
                <SquareAvatar src={selfAvatar} seed={row.address} name={selfName ?? ""} size={32} />
              ) : (
                <span
                  aria-hidden
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[12px] font-semibold text-white/35"
                >
                  {rank}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-white">
                    {isMe && selfName ? selfName : truncateAddress(row.address)}
                  </span>
                  {isMe ? (
                    <span className="bg-accent/15 text-accent shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold">
                      {t("leaderboardYou")}
                    </span>
                  ) : null}
                </div>
                <div className="tnum mt-0.5 text-[11.5px] font-normal text-white/45">
                  {t("leaderboardWins", { count: row.wins })}
                  {row.bestUsd > 0
                    ? ` · ${t("leaderboardBest", { amount: money.format(row.bestUsd) })}`
                    : ""}
                </div>
              </div>

              <span className="tnum shrink-0 text-right text-[14.5px] font-semibold text-white">
                {money.format(row.totalUsd)}
              </span>
            </li>
          );
        })}
      </ol>

      {paged.pageCount > 1 ? (
        <Pager
          from={paged.from}
          to={paged.to}
          total={paged.total}
          canPrev={paged.canPrev}
          canNext={paged.canNext}
          onPrev={paged.goPrev}
          onNext={paged.goNext}
          label={t("leaderboardPagerLabel")}
        />
      ) : null}
    </div>
  );
}
