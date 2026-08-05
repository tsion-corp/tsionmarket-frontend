"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ModalShell } from "@/components/ui/modal-shell";
import { LocalPredictionCard } from "@/components/dashboard/prediction/prediction-card-local";
import { EventCard } from "@/components/dashboard/prediction/event-card-local";
import { LocalPredictionSlider } from "@/components/dashboard/prediction/prediction-slider-local";
import { PortfolioPanel } from "@/components/dashboard/prediction/positions-panel-local";
import { CreateMarketFlow } from "@/components/dashboard/prediction/create-market-flow";
import { useMarkets, useCategories } from "@/hooks/use-prediction-markets";
import { useGroups } from "@/hooks/use-prediction-detail";
import type { Market, MarketGroup, MarketStatus } from "@/lib/prediction/types";

// The LOCAL (on-chain CPMM) prediction browse — our own markets with holders,
// activity, comments, and multi-outcome events. Rendered as the "Local" tab of
// the prediction page, alongside the live Polymarket tab. Status + category
// filters, a create-market entry, and the portfolio panel. Each card links to
// the CPMM market detail page where trading/liquidity/resolution live.
const STATUS_TABS: MarketStatus[] = ["Open", "Closed", "Resolved"];

// Markets kept out of the browse grid, by on-chain id.
//
// A duplicate or test market that is still Open cannot be removed any other way
// from the frontend: the backend keeps serving it, and only its creator can
// resolve or invalidate it on-chain. Listing the id here hides the card without
// touching anyone's position in it, which stays claimable from the portfolio.
//
// A stopgap, not a feature. Prefer resolving or invalidating the market so it
// leaves the grid on its own, and delete the id from here when that happens.
const HIDDEN_MARKET_IDS = new Set<string>([
  // "Will the Prime Minister attend today's presentation?" — a never-traded
  // duplicate of the Loveworld Nation market. Seeded with $2 of liquidity by
  // its creator and nothing else.
  "96044488616821290839541457419266907383",
]);

// A browse-grid entry: either a multi-outcome event (group) or a standalone
// single market. Events are rendered as one grouped card; single markets as the
// usual YES/NO tile.
type BrowseItem = { kind: "event"; group: MarketGroup } | { kind: "market"; market: Market };

export function LocalPredictionView() {
  const t = useTranslations("prediction");
  const [desktop, setDesktop] = useState(false);
  const [status, setStatus] = useState<MarketStatus>("Open");
  const [category, setCategory] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: markets, isLoading } = useMarkets(status);
  // Multi-outcome EVENTS (Polymarket-style groups). Their member markets are real
  // binary markets that ALSO come back from useMarkets — we surface the event as a
  // single grouped card and hide its members from the flat grid so the browse
  // shows one "event" tile instead of N scattered "Title — Outcome" cards.
  const { data: groups } = useGroups({ status });
  const { data: categories } = useCategories();

  const tabs = useMemo(() => {
    const set = new Set<string>();
    for (const c of categories ?? []) set.add(c);
    for (const m of markets ?? []) if (m.category) set.add(m.category);
    for (const g of groups ?? []) if (g.category) set.add(g.category);
    return Array.from(set);
  }, [categories, markets, groups]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Combine events + standalone markets into one browse list. Member markets of
  // an event are hidden from the flat grid (the event card represents them), so
  // the same underlying market never appears twice.
  const items = useMemo<BrowseItem[]>(() => {
    const groupList = groups ?? [];

    // Primary hide-set: exact member marketIds the group reports.
    const memberIds = new Set<string>();
    for (const g of groupList) {
      for (const o of g.outcomes) memberIds.add(o.marketId.toString());
    }

    // Fallback hide-set: each member market's question is created as
    // "<event title> — <outcome label>" (see use-create-event.ts), so any market
    // whose question starts with a known event's "<title> — " prefix belongs to
    // that event even if the group's `outcomes` array came back empty or partial
    // (e.g. an interrupted create where not every addGroupMember completed).
    // Without this, those member markets leak into the grid as standalone
    // "Title — Outcome" cards instead of being represented by the event card.
    const titlePrefixes = groupList.map((g) => `${g.title.trim().toLowerCase()} — `);
    const belongsToEvent = (m: Market): boolean => {
      if (memberIds.has(m.marketId.toString())) return true;
      const q = (m.question ?? "").trim().toLowerCase();
      return q.length > 0 && titlePrefixes.some((prefix) => q.startsWith(prefix));
    };

    const standalone = (markets ?? []).filter(
      (m) => !belongsToEvent(m) && !HIDDEN_MARKET_IDS.has(m.marketId.toString())
    );
    const events: BrowseItem[] = groupList.map((g) => ({ kind: "event", group: g }));
    const singles: BrowseItem[] = standalone.map((m) => ({ kind: "market", market: m }));
    // Events lead the grid (they're the richer surface), then single markets.
    return [...events, ...singles];
  }, [groups, markets]);

  const list = category
    ? items.filter((it) =>
        it.kind === "event" ? it.group.category === category : it.market.category === category
      )
    : items;

  // Mobile slider only carries single markets (its card is single-market shaped).
  const sliderMarkets = list.flatMap((it) => (it.kind === "market" ? [it.market] : []));

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
              {list.map((it) =>
                it.kind === "event" ? (
                  <EventCard key={`event-${it.group.id}`} group={it.group} />
                ) : (
                  <LocalPredictionCard
                    key={`market-${it.market.marketId.toString()}`}
                    market={it.market}
                  />
                )
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {list
              .filter((it): it is Extract<BrowseItem, { kind: "event" }> => it.kind === "event")
              .map((it) => (
                <EventCard key={`event-${it.group.id}`} group={it.group} />
              ))}
            {sliderMarkets.length > 0 ? <LocalPredictionSlider markets={sliderMarkets} /> : null}
          </div>
        )}

        <PortfolioPanel />
      </div>

      <ModalShell open={creating} onClose={() => setCreating(false)} panelClassName="max-w-[560px]">
        <CreateMarketFlow onDone={() => setCreating(false)} />
      </ModalShell>
    </div>
  );
}
