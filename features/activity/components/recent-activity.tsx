"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Eyebrow } from "@/components/ui/eyebrow";
import { ClockIcon } from "@/components/ui/icons";
import { ActivityRow } from "@/features/activity/components/activity-row";
import { useActivity } from "@/features/activity/hooks/use-activity";
import { useDepositAnalytics } from "@/features/activity/hooks/use-deposit-analytics";
import { usePortfolio } from "@/hooks/use-portfolio";
import { displaySymbol } from "@/lib/buy";

const PREVIEW_COUNT = 5;

// The last few transfers, on the dashboard. The full history — grouped by day,
// every chain — lives on its own page behind the button below.
export function RecentActivity() {
  const t = useTranslations("activity");
  const { items, loading } = useActivity();
  const portfolio = usePortfolio();

  // A settled deposit is only visible as an inbound transfer, and this is the
  // one place on the dashboard already watching for those.
  useDepositAnalytics(items);

  const priceBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const token of portfolio.tokens) {
      if (token.priceUsd > 0) map.set(token.symbol.toUpperCase(), token.priceUsd);
    }
    return map;
  }, [portfolio.tokens]);

  const preview = items.slice(0, PREVIEW_COUNT);

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>{t("recentEyebrow")}</Eyebrow>

      <div className="ws-card mt-3.5 overflow-hidden">
        {loading ? (
          <div className="px-6 py-10 text-center text-[13.5px] font-normal text-white/45">
            {t("loading")}
          </div>
        ) : preview.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/6">
              <ClockIcon size={20} />
            </div>
            <p className="max-w-[320px] text-[13.5px] font-normal text-white/55">
              {t("emptyBody")}
            </p>
          </div>
        ) : (
          preview.map((item) => (
            <ActivityRow
              key={item.id}
              item={item}
              priceUsd={priceBySymbol.get(displaySymbol(item.symbol).toUpperCase()) ?? 0}
            />
          ))
        )}
      </div>

      <Link
        href="/activity"
        className="mt-3 flex w-full cursor-pointer items-center justify-center rounded-[14px] border border-white/12 bg-white/5 p-3.5 font-sans text-[14px] font-medium text-white transition-colors hover:bg-white/10"
      >
        {t("viewAll")}
      </Link>
    </div>
  );
}
