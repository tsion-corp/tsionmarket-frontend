"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { useGroup, useGroupChart } from "@/features/prediction/hooks/use-prediction-detail";
import { CommentsPanel } from "@/features/prediction/components/comments-panel";
import { EventChart } from "@/features/prediction/components/event-chart";
import { EventResolvePanel } from "@/features/prediction/components/event-resolve-panel";
import { OutcomeRow } from "@/features/prediction/components/outcome-row";
import { compactUsd } from "@/features/prediction/lib/format";
import type { ChartInterval } from "@/features/prediction/lib/types";
import { track } from "@/lib/analytics/mixpanel";

const INTERVALS: ChartInterval[] = ["1h", "4h", "1d"];

// Event (multi-outcome) detail page — Polymarket's grouped-market view: an event
// header, then a list of candidate/outcome rows (each its own on-chain YES/NO
// market with Buy Yes / Buy No), the context blurb + rules, and event comments.

interface EventDetailProps {
  idOrSlug: string;
}

export function EventDetail({ idOrSlug }: EventDetailProps) {
  const t = useTranslations("prediction");
  const [interval, setInterval] = useState<ChartInterval>("1h");
  const { data: group, isLoading } = useGroup(idOrSlug);

  const viewed = useRef<string | null>(null);
  useEffect(() => {
    if (!group || viewed.current === idOrSlug) return;
    viewed.current = idOrSlug;
    track("prediction_market_viewed", { market_id: idOrSlug, scope: "local" });
  }, [idOrSlug, group]);
  const { data: chart } = useGroupChart(idOrSlug, interval);

  if (isLoading || !group) {
    return (
      <div className="mx-auto w-full max-w-[1240px] p-4 sm:p-6 lg:p-8">
        <div className="ws-card px-6 py-12 text-center text-[13.5px] font-normal text-white/55">
          {t("loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] p-4 sm:p-6 lg:p-8">
      <Link
        href="/prediction"
        className="mb-4 inline-flex items-center gap-1 text-[13px] font-medium text-white/55 hover:text-white"
      >
        <ChevronLeftIcon size={14} />
        {t("backToMarkets")}
      </Link>

      {/* Event header */}
      <div className="ws-card flex items-center gap-4 p-5 sm:p-6">
        {group.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={group.imageUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-xl object-cover sm:h-16 sm:w-16"
          />
        ) : (
          <div className="h-14 w-14 shrink-0 rounded-xl bg-[radial-gradient(120%_120%_at_20%_0%,rgba(124,231,176,0.3),transparent),radial-gradient(120%_120%_at_100%_100%,rgba(120,140,255,0.25),transparent)] sm:h-16 sm:w-16" />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px] font-medium">
            {group.category ? (
              <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-white/75">
                {group.category}
              </span>
            ) : null}
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/60">
              {compactUsd(group.volumeUsdc)} {t("eventVolume")}
            </span>
            <span className="text-white/45">
              {t("outcomeCount", { count: group.outcomeCount })}
            </span>
          </div>
          <h1 className="ws-display truncate text-[20px] leading-tight tracking-[-0.01em] sm:text-[26px]">
            {group.title}
          </h1>
        </div>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          {/* Multi-line chart: one probability line per outcome over time. */}
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
            {chart && chart.some((s) => s.points.length > 0) ? (
              <EventChart series={chart} height={220} />
            ) : (
              <p className="py-10 text-center text-[13px] font-normal text-white/45">
                {t("chartEmpty")}
              </p>
            )}
          </div>

          {/* Outcome (candidate) rows */}
          <div className="ws-card p-3 sm:p-4">
            <span className="ws-display mb-2 block px-2 pt-1 text-[14px]">
              {t("outcomesTitle")}
            </span>
            <ul className="flex flex-col">
              {group.outcomes.map((o) => (
                <OutcomeRow key={o.memberId} outcome={o} />
              ))}
            </ul>
          </div>

          {/* Context + rules */}
          {group.description || group.rules ? (
            <div className="ws-card flex flex-col gap-4 p-5 sm:p-6">
              <span className="ws-display text-[15px]">{t("rulesTitle")}</span>
              {group.description ? (
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-white/75">
                  {group.description}
                </p>
              ) : null}
              {group.rules ? (
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-white/60">
                  {group.rules}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-6">
          {/* Creator-only: resolve each outcome market independently. Renders
              nothing for non-creators or a fully-resolved event. */}
          <EventResolvePanel group={group} />
          <CommentsPanel groupId={group.id} />
        </div>
      </div>
    </div>
  );
}
