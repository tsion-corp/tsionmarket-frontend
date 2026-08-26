"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ChevronLeftIcon, ClockIcon } from "@/components/ui/icons";
import { ActivityRow, dayHeading } from "@/features/activity/components/activity-row";
import { useActivity, type ActivityEntry } from "@/features/activity/hooks/use-activity";
import { usePortfolio } from "@/hooks/use-portfolio";
import { displaySymbol } from "@/lib/buy";

const NO_GAMES: ActivityEntry[] = [];
// Rows per page. Kept small on purpose: with pagination there is no need to
// render a long wall of history at once, so each page stays light and quick.
const PAGE_SIZE = 12;

// Wallet history across every chain we track, newest first and grouped by day.
// Indexed on-chain rather than recorded by the app, so transfers received
// elsewhere appear too, not only what this app sent. `gameEntries` are the
// off-chain arcade plays (chess, checkers, ArkBall) the route pulls from the
// casino feature and merges in, since those never touch the chain.
export function ActivityView({ gameEntries = NO_GAMES }: { gameEntries?: ActivityEntry[] } = {}) {
  const t = useTranslations("activity");
  const { items: chainItems, loading, error, refetch } = useActivity();
  const portfolio = usePortfolio();
  const [page, setPage] = useState(0);
  const topRef = useRef<HTMLDivElement>(null);

  // On-chain transfers and off-chain game plays are one timeline once merged.
  // Deduped by id so no source can ever put the same event on the feed twice.
  const items = useMemo(() => {
    const seen = new Set<string>();
    const merged: ActivityEntry[] = [];
    for (const entry of [...chainItems, ...gameEntries]) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      merged.push(entry);
    }
    return merged.sort((a, b) => b.timestamp - a.timestamp);
  }, [chainItems, gameEntries]);

  // Prices come from the holdings the user already has loaded, so a row can
  // show what the transfer was worth without another price request.
  const priceBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const token of portfolio.tokens) {
      if (token.priceUsd > 0) map.set(token.symbol.toUpperCase(), token.priceUsd);
    }
    return map;
  }, [portfolio.tokens]);

  // Page the merged feed. `current` is clamped, so a poll that shrinks the list
  // can never strand the view on a page that no longer exists.
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageItems = useMemo(
    () => items.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE),
    [items, current]
  );

  const goTo = (next: number) => {
    setPage(next);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const groups = useMemo(() => {
    const out: { heading: string; items: ActivityEntry[] }[] = [];
    for (const item of pageItems) {
      const heading = item.timestamp ? dayHeading(item.timestamp, t) : t("unknownDate");
      const last = out[out.length - 1];
      if (last?.heading === heading) last.items.push(item);
      else out.push({ heading, items: [item] });
    }
    return out;
  }, [pageItems, t]);

  return (
    <div ref={topRef} className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <p className="mt-2 max-w-[560px] text-[13.5px] leading-[1.5] font-normal text-white/55">
        {t("subtitle")}
      </p>

      {loading ? (
        <div className="ws-card mt-[18px] px-6 py-12 text-center text-[13.5px] font-normal text-white/45">
          {t("loading")}
        </div>
      ) : error ? (
        <div className="ws-card mt-[18px] flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="text-[13.5px] font-normal text-white/55">{t("errorBody")}</div>
          <button
            onClick={() => void refetch()}
            className="text-ink cursor-pointer rounded-xl bg-white px-5 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
          >
            {t("tryAgain")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="ws-card mt-[18px] flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/6">
            <ClockIcon size={22} />
          </div>
          <div className="ws-display text-[20px]">{t("emptyTitle")}</div>
          <p className="max-w-[320px] text-[13.5px] font-normal text-white/55">{t("emptyBody")}</p>
        </div>
      ) : (
        <>
          {groups.map((group) => (
            <div key={group.heading} className="mt-[18px]">
              <div className="mb-2 px-1 text-[11.5px] font-normal tracking-[0.04em] text-white/40 uppercase">
                {group.heading}
              </div>
              <div className="ws-card overflow-hidden">
                {group.items.map((item) => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    priceUsd={priceBySymbol.get(displaySymbol(item.symbol).toUpperCase()) ?? 0}
                  />
                ))}
              </div>
            </div>
          ))}

          {pageCount > 1 ? (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => goTo(current - 1)}
                disabled={current === 0}
                aria-label={t("prevPage")}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeftIcon size={16} />
              </button>
              <span className="tnum px-2 text-[13px] font-normal text-white/55">
                {t("pageOf", { current: current + 1, total: pageCount })}
              </span>
              <button
                onClick={() => goTo(current + 1)}
                disabled={current >= pageCount - 1}
                aria-label={t("nextPage")}
                className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeftIcon size={16} className="rotate-180" />
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
