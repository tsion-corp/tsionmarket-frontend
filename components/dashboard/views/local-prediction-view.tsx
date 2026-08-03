"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { LocalPredictionCard } from "@/components/dashboard/prediction/prediction-card-local";
import { LocalPredictionSlider } from "@/components/dashboard/prediction/prediction-slider-local";
import { PortfolioPanel } from "@/components/dashboard/prediction/positions-panel-local";
import { CreateMarketFlow } from "@/components/dashboard/prediction/create-market-flow";
import { useMarkets, useCategories } from "@/hooks/use-prediction-markets";
import type { MarketStatus } from "@/lib/prediction/types";

// The LOCAL (on-chain CPMM) prediction browse — our own markets with holders,
// activity, comments, and multi-outcome events. Rendered as the "Local" tab of
// the prediction page, alongside the live Polymarket tab. Status + category
// filters, a create-market entry, and the portfolio panel. Each card links to
// the CPMM market detail page where trading/liquidity/resolution live.
const STATUS_TABS: MarketStatus[] = ["Open", "Closed", "Resolved"];

export function LocalPredictionView() {
  const t = useTranslations("prediction");
  const [desktop, setDesktop] = useState(false);
  const [status, setStatus] = useState<MarketStatus>("Open");
  const [category, setCategory] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: markets, isLoading } = useMarkets(status);
  const { data: categories } = useCategories();

  const tabs = useMemo(() => {
    const set = new Set<string>();
    for (const c of categories ?? []) set.add(c);
    for (const m of markets ?? []) if (m.category) set.add(m.category);
    return Array.from(set);
  }, [categories, markets]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const list = category ? (markets ?? []).filter((m) => m.category === category) : (markets ?? []);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[520px] text-[13.5px] font-normal text-white/55">
          {t("localTabBlurb")}
        </p>
        <button
          onClick={() => setCreating(true)}
          className="text-ink shrink-0 cursor-pointer rounded-xl bg-white px-4 py-2.5 font-sans text-[13px] font-semibold hover:opacity-90"
        >
          {t("createMarket")}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(s);
              setCategory(null);
            }}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              status === s
                ? "border-accent/45 bg-accent/12 text-white"
                : "border-white/10 bg-white/4 text-white/65 hover:bg-white/8"
            }`}
          >
            {t(`status_${s}`)}
          </button>
        ))}
      </div>

      {tabs.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory(null)}
            className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
              category === null
                ? "border-accent/45 bg-accent/12 text-white"
                : "border-white/10 bg-white/4 text-white/65 hover:bg-white/8"
            }`}
          >
            {t("allCategories")}
          </button>
          {tabs.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                category === c
                  ? "border-accent/45 bg-accent/12 text-white"
                  : "border-white/10 bg-white/4 text-white/65 hover:bg-white/8"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-[18px]">
        {isLoading ? (
          <div className="ws-card px-6 py-12 text-center text-[13.5px] font-normal text-white/55">
            {t("loading")}
          </div>
        ) : list.length === 0 ? (
          <div className="ws-card px-6 py-12 text-center text-[13.5px] font-normal text-white/55">
            {t(`noMarkets_${status}`)}
          </div>
        ) : desktop ? (
          <div className="@container">
            <div className="grid grid-cols-2 gap-4 @min-[900px]:grid-cols-3 @min-[900px]:gap-6 @min-[1240px]:grid-cols-4 @min-[1240px]:gap-7">
              {list.map((m) => (
                <LocalPredictionCard key={m.marketId.toString()} market={m} />
              ))}
            </div>
          </div>
        ) : (
          <LocalPredictionSlider markets={list} />
        )}

        <PortfolioPanel />
      </div>

      <ModalShell open={creating} onClose={() => setCreating(false)} panelClassName="max-w-[560px]">
        <CreateMarketFlow onDone={() => setCreating(false)} />
      </ModalShell>
    </div>
  );
}
