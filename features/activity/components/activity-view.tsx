"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ClockIcon } from "@/components/ui/icons";
import { ActivityRow, dayHeading } from "@/features/activity/components/activity-row";
import { useActivity, type ActivityEntry } from "@/features/activity/hooks/use-activity";
import { usePortfolio } from "@/hooks/use-portfolio";
import { displaySymbol } from "@/lib/buy";

// Wallet history across every chain we track, newest first and grouped by day.
// Indexed on-chain rather than recorded by the app, so transfers received
// elsewhere appear too, not only what this app sent.
export function ActivityView() {
  const t = useTranslations("activity");
  const { items, loading, error, refetch } = useActivity();
  const portfolio = usePortfolio();

  // Prices come from the holdings the user already has loaded, so a row can
  // show what the transfer was worth without another price request.
  const priceBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const token of portfolio.tokens) {
      if (token.priceUsd > 0) map.set(token.symbol.toUpperCase(), token.priceUsd);
    }
    return map;
  }, [portfolio.tokens]);

  const groups = useMemo(() => {
    const out: { heading: string; items: ActivityEntry[] }[] = [];
    for (const item of items) {
      const heading = item.timestamp ? dayHeading(item.timestamp, t) : t("unknownDate");
      const last = out[out.length - 1];
      if (last?.heading === heading) last.items.push(item);
      else out.push({ heading, items: [item] });
    }
    return out;
  }, [items, t]);

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
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
        groups.map((group) => (
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
        ))
      )}
    </div>
  );
}
