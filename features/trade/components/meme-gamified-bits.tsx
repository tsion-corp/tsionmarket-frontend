"use client";

import { useTranslations } from "next-intl";
import { ProgressBar } from "@/components/ui/progress-bar";
import { compactUsd } from "@/lib/meme/format";
import { changeBarPercent, exactDecimal, type Momentum } from "@/lib/meme/momentum";
import type { metricValue } from "@/lib/meme/screener";
import type { MemeTimeframe } from "@/lib/meme/types";
import { WHAT_IF_STAKE_USD, whatIfValue } from "@/lib/meme/what-if";
import { formatDecimalString } from "@/lib/trade/amount";

// The small gamified pieces the Trending strip, the desk table and the phone
// rows share (ADR-2026-09-15-meme-trending-screener, section 3). They draw
// with the tokens the app already has: up and down for gains and losses, the
// leaderboard's silver ring for ranks, the RiskBadge pill for momentum.

type ScreenerTranslator = ReturnType<typeof useTranslations<"memeScreener">>;

/** The memeScreener key that names a window, e.g. "timeframe1h". */
export function timeframeLabelKey(timeframe: MemeTimeframe): `timeframe${MemeTimeframe}` {
  return `timeframe${timeframe}`;
}

export function TimeframeLabel({ timeframe }: { timeframe: MemeTimeframe }) {
  const t = useTranslations("memeScreener");
  return <>{t(timeframeLabelKey(timeframe))}</>;
}

/**
 * A change as the cards print it, "+12.34%" or "-4.50%", rounded half up on
 * the decimal string so the label never depends on how a float rounds. Null
 * for a missing or unreadable change.
 */
export function signedPercent(change: string | null): string | null {
  const value = exactDecimal(change);
  if (value === null) return null;
  const negative = value.units < 0n;
  const magnitude = negative ? -value.units : value.units;
  // Hundredths, rounded half up on the magnitude.
  const denominator = 10n ** BigInt(value.scale);
  const hundredths = (magnitude * 200n + denominator) / (denominator * 2n);
  const whole = hundredths / 100n;
  const fraction = (hundredths % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : "+"}${whole}.${fraction}%`;
}

// A change reads as a gain from zero up, the same rule PctChange draws with.
function isGain(change: string | null): boolean | null {
  const value = exactDecimal(change);
  return value === null ? null : value.units >= 0n;
}

// Rank rings copy the leaderboard's in winners-list.tsx, shrunk to sit beside
// a 28px coin. A pill rather than a circle past two digits, so "#100" fits.
export function RankRing({ rank }: { rank: number }) {
  const t = useTranslations("memeScreener");
  return (
    <span
      className={`tnum grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-[#d8d8dc]/12 px-1 text-[10px] ring-1 ${
        rank <= 3
          ? "font-bold text-[#d8d8dc] ring-[#d8d8dc]/45"
          : "font-semibold text-white/60 ring-[#d8d8dc]/20"
      }`}
    >
      {t("rank", { rank })}
    </span>
  );
}

// RiskBadge's tones, strongest at the ends: mooning takes CRITICAL's weight
// in green, dumping takes it in red.
const MOMENTUM_STYLE: Record<Momentum, string> = {
  mooning: "bg-up/20 text-up border-up/45",
  pumping: "bg-up/14 text-up border-up/30",
  cooling: "bg-down/12 text-down border-down/30",
  dumping: "bg-down/20 text-down border-down/45",
};

const MOMENTUM_EMOJI: Record<Momentum, string> = {
  mooning: "🚀",
  pumping: "🔥",
  cooling: "🧊",
  dumping: "🩸",
};

const MOMENTUM_KEY: Record<Momentum, `momentum${Capitalize<Momentum>}`> = {
  mooning: "momentumMooning",
  pumping: "momentumPumping",
  cooling: "momentumCooling",
  dumping: "momentumDumping",
};

export function MomentumTag({ momentum }: { momentum: Momentum | null }) {
  const t = useTranslations("memeScreener");
  if (momentum === null) return null;
  return (
    <span
      data-momentum={momentum}
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold tracking-[0.06em] whitespace-nowrap uppercase ${MOMENTUM_STYLE[momentum]}`}
    >
      <span aria-hidden="true" className="text-[10px] leading-none tracking-normal">
        {MOMENTUM_EMOJI[momentum]}
      </span>
      {t(MOMENTUM_KEY[momentum])}
    </span>
  );
}

// "$100 → $112.34". The figure is worked out exactly in what-if.ts; only the
// grouping of the whole part happens here, on the string, and both cents
// digits are kept because it is a money figure.
export function WhatIfLine({
  change,
  timeframe,
}: {
  change: string | null;
  timeframe: MemeTimeframe;
}) {
  const t = useTranslations("memeScreener");
  const value = whatIfValue(WHAT_IF_STAKE_USD, change);
  if (value === null) return null;
  const [whole, cents] = value.split(".");
  const shown = `$${formatDecimalString(whole, 0)}.${cents}`;
  return (
    <span
      title={t("whatIfHint", { timeframe: t(timeframeLabelKey(timeframe)) })}
      className={`tnum block truncate font-sans text-[11px] leading-[14px] font-semibold ${
        isGain(change) ? "text-up" : "text-down"
      }`}
    >
      {t("whatIf", { value: shown })}
    </span>
  );
}

// The coin's volume against the busiest coin's. An unknown volume keeps the
// empty track, so the card does not change shape, and says why to a reader.
export function HeatBar({ share }: { share: number | null }) {
  const t = useTranslations("memeScreener");
  return (
    <div data-heat title={t("heatLabel")}>
      <ProgressBar pct={share ?? 0} />
      {share === null ? <span className="sr-only">{t("heatNoData")}</span> : null}
    </div>
  );
}

// A 2px bar under a percentage, as wide as the move in whole points up to
// 100. Decorative: the figure beside it already says the same thing.
export function ChangeBar({
  change,
  className = "",
}: {
  change: string | null;
  className?: string;
}) {
  const width = changeBarPercent(change);
  if (width === null) return null;
  return (
    <span
      aria-hidden="true"
      className={`block h-[2px] w-full overflow-hidden rounded-full bg-white/8 ${className}`}
    >
      <span
        className={`block h-full rounded-full ${isGain(change) ? "bg-up" : "bg-down"}`}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

const COUNT_FORMAT = new Intl.NumberFormat("en-US");

/**
 * The figure a sort metric's column shows: money compact, counts grouped, age
 * in the largest whole unit. A missing figure is always "—", never 0.
 */
export function formatMetric(value: ReturnType<typeof metricValue>, t: ScreenerTranslator): string {
  switch (value.kind) {
    case "usd":
      return compactUsd(value.value);
    case "count":
      return value.value === null ? "—" : COUNT_FORMAT.format(value.value);
    case "age": {
      const { minutes } = value;
      if (minutes === null) return "—";
      if (minutes < 60) return t("ageMinutes", { count: minutes });
      if (minutes < 1440) return t("ageHours", { count: Math.floor(minutes / 60) });
      return t("ageDays", { count: Math.floor(minutes / 1440) });
    }
  }
}
