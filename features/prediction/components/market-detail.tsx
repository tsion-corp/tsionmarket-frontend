"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ProbabilityChart } from "@/features/prediction/components/probability-chart";
import { TradeTape } from "@/features/prediction/components/trade-tape";
import { ExecutionPanel } from "@/features/prediction/components/execution-panel";
import { MarketPositions } from "@/features/prediction/components/market-positions";
import { LiquidityPanel } from "@/features/prediction/components/liquidity-panel";
import { TopHolders } from "@/features/prediction/components/top-holders";
import { ActivityFeed } from "@/features/prediction/components/activity-feed";
import { CommentsPanel } from "@/features/prediction/components/comments-panel";
import { MarketRules } from "@/features/prediction/components/market-rules";
import {
  useMarket,
  useMarketChart,
  useMarketTrades,
} from "@/features/prediction/hooks/use-prediction-markets";
import { useMyMarkets } from "@/features/prediction/hooks/use-prediction-portfolio";
import { useMarketGroupId } from "@/features/prediction/hooks/use-prediction-neg-risk";
import { useParentEvent } from "@/features/prediction/hooks/use-prediction-detail";
import { usePredictionMarketStream } from "@/features/prediction/hooks/use-prediction-market-stream";
import { usePredictionActions } from "@/features/prediction/hooks/use-prediction-actions";
import { CloseTimer } from "@/features/prediction/components/close-timer";
import {
  compactUsd,
  formatCloseDateTime,
  priceToCents,
  priceToPct,
} from "@/features/prediction/lib/format";
import type { ChartInterval, Side, Trade } from "@/features/prediction/lib/types";

// A compact set of intervals for the smaller chart.
const INTERVALS: ChartInterval[] = ["1h", "4h", "1d"];

type DetailTab = "positions" | "activity" | "holders" | "comments" | "rules";
const DETAIL_TABS: DetailTab[] = ["positions", "activity", "holders", "comments", "rules"];

interface MarketDetailProps {
  id: string;
}

export function MarketDetail({ id }: MarketDetailProps) {
  const t = useTranslations("prediction");
  const searchParams = useSearchParams();
  const initialSide: Side = searchParams.get("side") === "no" ? "no" : "yes";
  const [interval, setInterval] = useState<ChartInterval>("1h");
  const [tab, setTab] = useState<DetailTab>("activity");

  const { data: market, isLoading } = useMarket(id);
  const { data: chart } = useMarketChart(id, interval);
  const { data: restTrades } = useMarketTrades(id);
  const { liveTrades } = usePredictionMarketStream(id);
  const { data: myMarkets } = useMyMarkets();
  const actions = usePredictionActions();

  // Live trades sit on top of the REST tape, capped for display.
  const trades: Trade[] = useMemo(
    () => [...liveTrades, ...(restTrades ?? [])].slice(0, 60),
    [liveTrades, restTrades]
  );

  // A user owns this market if the on-chain creator matches, or the market is in
  // their /markets/mine list (reliable even before the indexer backfills creator).
  const createdByMe = (myMarkets ?? []).some((m) => m.marketId.toString() === id);
  const isCreator =
    createdByMe ||
    (!!market && !!actions.wallet && market.creator.toLowerCase() === actions.wallet.toLowerCase());

  // A market inside a neg-risk group cannot be resolved on its own: resolve()
  // reverts with "neg-risk member" because the whole event settles together.
  // The creator does it from the event page instead, so hide the control here
  // rather than offer one that always fails.
  const { data: groupId } = useMarketGroupId(market?.marketId ?? null);
  const grouped = groupId != null;
  const canResolve =
    isCreator && !grouped && (market?.status === "Open" || market?.status === "Closed");

  // The parent event, for the breadcrumb. Only looked up for a grouped market.
  const { data: parentEvent } = useParentEvent(id, grouped);

  if (isLoading || !market) {
    return (
      <div className="mx-auto w-full max-w-[1240px] p-4 sm:p-6 lg:p-8">
        <div className="ws-card px-6 py-12 text-center text-[13.5px] font-normal text-white/55">
          {t("loading")}
        </div>
      </div>
    );
  }

  const yesPct = priceToPct(market.priceYes);
  const closeAt = formatCloseDateTime(market.closeTime);

  return (
    <div className="mx-auto w-full max-w-[1240px] p-4 sm:p-6 lg:p-8">
      {/* An outcome of an event is not a standalone market, so the trail back
          goes to its event rather than the market list. Falls back to the list
          while the parent is still loading, or when there is no parent. */}
      {parentEvent ? (
        <Link
          href={`/prediction/event/${parentEvent.slug}`}
          className="mb-4 inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-white/55 hover:text-white"
        >
          <ChevronLeftIcon size={14} />
          <span className="truncate">{t("partOfEvent", { title: parentEvent.title })}</span>
        </Link>
      ) : (
        <Link
          href="/prediction"
          className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-white/55 hover:text-white"
        >
          <ChevronLeftIcon size={14} />
          {t("backToMarkets")}
        </Link>
      )}

      {/* Hero banner: the market image spans the full width with the question and
          live prices laid over a gradient, so the page opens on something rich. */}
      <div className="ws-card relative overflow-hidden rounded-[22px] p-0">
        <div className="relative h-[220px] w-full bg-[#0c0c0e] sm:h-[300px]">
          {market.imageUrl ? (
            // object-contain (not cover) so the FULL image shows in the hero
            // without cutting the sides; the #0c0c0e frame matches the upload
            // padding so it reads as one piece.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={market.imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(120%_120%_at_20%_0%,rgba(124,231,176,0.22),transparent),radial-gradient(120%_120%_at_100%_100%,rgba(120,140,255,0.18),transparent)]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,12,14,0.15),rgba(12,12,14,0.55)_55%,rgba(12,12,14,0.92))]" />

          {/* Top row: category, volume, status. */}
          <div className="absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-4 text-[12px] font-medium sm:p-5">
            {market.category ? (
              <span className="rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-white/90 backdrop-blur-sm">
                {market.category}
              </span>
            ) : null}
            <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-white/75 backdrop-blur-sm">
              {compactUsd(market.volumeUsdc)}
            </span>
            <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-white/75 backdrop-blur-sm">
              {t(`status_${market.status}`)}
            </span>
            {/* The deadline owns the opposite end of the row from the metadata
                chips: it is the one value on this page that changes on its own,
                and it earns the isolation. Larger than the chips beside it, and
                it escalates as the close approaches — neutral far out, brighter
                inside the last hour, red and pulsing in the final ten minutes,
                where a trade may no longer land. Styling keys off the timer's
                own data-urgency so the thresholds live in one tested place. */}
            <CloseTimer
              closeTime={market.closeTime}
              status={market.status}
              className="tnum data-[urgency=imminent]:border-down/60 data-[urgency=imminent]:bg-down/20 data-[urgency=imminent]:text-down motion-safe:data-[urgency=imminent]:ws-close-urgent ml-auto rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold backdrop-blur-sm transition-colors data-[urgency=none]:border-white/20 data-[urgency=none]:bg-black/40 data-[urgency=none]:text-white/85 data-[urgency=soon]:border-white/45 data-[urgency=soon]:bg-white/12 data-[urgency=soon]:text-white sm:text-[15px]"
            />
            {market.outcome !== "Unresolved" ? (
              <span className="border-accent/40 bg-accent/20 text-accent rounded-full border px-2.5 py-1 backdrop-blur-sm">
                {t("resolvedOutcome", { outcome: market.outcome })}
              </span>
            ) : null}
          </div>

          {/* Bottom: the question + a probability bar with YES/NO prices. */}
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
            <h1 className="ws-display max-w-[820px] text-[22px] leading-tight tracking-[-0.01em] sm:text-[28px]">
              {market.question ?? t("marketFallback")}
            </h1>
            <div className="mt-3 flex items-center gap-4">
              <span className="ws-display text-up text-[24px] sm:text-[30px]">
                {priceToCents(market.priceYes)}
                <span className="ml-1.5 align-middle text-[12px] font-normal text-white/60">
                  {t("yesLabel")}
                </span>
              </span>
              <span className="ws-display text-down text-[24px] sm:text-[30px]">
                {priceToCents(market.priceNo)}
                <span className="ml-1.5 align-middle text-[12px] font-normal text-white/60">
                  {t("noLabel")}
                </span>
              </span>
            </div>
            <div className="mt-2.5 max-w-[520px]">
              <ProgressBar pct={yesPct} color="#7CE7B0" />
            </div>
            {/* The exact deadline under the prices. The chip above counts down;
                this says when, which is what a trader needs before committing. */}
            {closeAt ? (
              <div className="tnum mt-2 text-[12.5px] font-normal text-white/55">
                {t("closesAt", { when: closeAt })}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Buy/sell sits to the side on desktop and sticks while the left column
          scrolls; it stacks under the banner on mobile. */}
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <div className="ws-card p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="ws-display text-[15px]">{t("probability")}</span>
              <div className="flex gap-1">
                {INTERVALS.map((iv) => (
                  <button
                    key={iv}
                    onClick={() => setInterval(iv)}
                    className={`cursor-pointer rounded-md px-2 py-1 text-[12px] font-medium transition-colors ${
                      interval === iv
                        ? "bg-white/12 text-white"
                        : "text-white/45 hover:text-white/70"
                    }`}
                  >
                    {iv}
                  </button>
                ))}
              </div>
            </div>
            <ProbabilityChart points={chart ?? []} height={150} />
          </div>

          {/* Tabbed detail surfaces — Polymarket-style: activity, top holders,
              comments, and the resolution rules. */}
          <div className="ws-card p-1.5">
            <div className="flex gap-1 overflow-x-auto">
              {DETAIL_TABS.map((tb) => (
                <button
                  key={tb}
                  onClick={() => setTab(tb)}
                  className={`shrink-0 cursor-pointer rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                    tab === tb ? "bg-white/10 text-white" : "text-white/45 hover:text-white/70"
                  }`}
                >
                  {t(`tab_${tb}`)}
                </button>
              ))}
            </div>
          </div>

          {tab === "positions" ? <MarketPositions market={market} /> : null}
          {tab === "activity" ? <ActivityFeed marketId={id} /> : null}
          {tab === "holders" ? <TopHolders marketId={id} /> : null}
          {tab === "comments" ? <CommentsPanel marketId={id} /> : null}
          {tab === "rules" ? <MarketRules market={market} /> : null}

          <TradeTape trades={trades} />
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-6">
          <ExecutionPanel market={market} initialSide={initialSide} />
          <LiquidityPanel market={market} />

          {canResolve ? (
            <div className="ws-card flex flex-col gap-2.5 p-5">
              <span className="ws-display text-[16px]">{t("resolveTitle")}</span>
              <p className="text-[12.5px] font-normal text-white/55">{t("resolveNote")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => actions.resolveMarket(market.marketId, "Yes")}
                  disabled={actions.busy}
                  className="border-up/45 bg-up/16 text-up cursor-pointer rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  {t("resolveYes")}
                </button>
                <button
                  onClick={() => actions.resolveMarket(market.marketId, "No")}
                  disabled={actions.busy}
                  className="border-down/45 bg-down/16 text-down cursor-pointer rounded-xl border py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  {t("resolveNo")}
                </button>
              </div>
              {market.status === "Open" ? (
                <button
                  onClick={() => actions.closeMarket(market.marketId)}
                  disabled={actions.busy}
                  className="cursor-pointer rounded-xl border border-white/12 bg-white/5 py-2.5 text-[13px] font-medium text-white/75 hover:text-white disabled:opacity-60"
                >
                  {t("closeMarketCta")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
