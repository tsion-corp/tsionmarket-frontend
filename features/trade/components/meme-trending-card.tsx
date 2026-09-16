"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { FlashPrice } from "@/features/trade/components/flash-price";
import { MemeCoin, priceLabel } from "@/features/trade/components/meme-bits";
import {
  HeatBar,
  MomentumTag,
  RankRing,
  WhatIfLine,
  signedPercent,
  timeframeLabelKey,
} from "@/features/trade/components/meme-gamified-bits";
import { changeFor, momentumOf } from "@/lib/meme/momentum";
import type { MemeTimeframe, MemeToken } from "@/lib/meme/types";

// One coin on the Trending strip: where it ranks, what it is doing over the
// selected window, and what that move would have done to $100.

// The leaderboard's entry: 0.04s between cards, never more than 0.3s in all.
const STAGGER_S = 0.04;
const STAGGER_CAP_S = 0.3;

// The narrowest a desk card may be drawn. Under this the rank, the coin and
// the change stop fitting across and the card reads as a column of scraps, so
// the strip wraps to another row instead of squeezing past it.
export const TRENDING_MIN_CARD_PX = 156;

// Both surfaces lay their cards on the same grid, so a card takes its cell and
// fills its height. The phone used to scroll its cards sideways, which cut the
// last one in half at the screen's edge.
const CARD_BOX = "h-full min-w-0";

export type TrendingVariant = "desk" | "phone";

export function MemeTrendingCard({
  token,
  rank,
  index,
  heat,
  timeframe,
  selected,
  reduceMotion,
  onSelect,
}: {
  token: MemeToken;
  rank: number;
  /** Position on this page, for the entry stagger. */
  index: number;
  heat: number | null;
  timeframe: MemeTimeframe;
  selected: boolean;
  reduceMotion: boolean;
  onSelect: (token: MemeToken) => void;
}) {
  const t = useTranslations("memeScreener");
  const change = changeFor(token, timeframe);
  const signed = signedPercent(change);
  const windowLabel = t(timeframeLabelKey(timeframe));
  const symbol = token.symbol ?? "?";

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(token)}
      // The name stays out of the label: it is the symbol that identifies a
      // coin on a card, and the page's row tests match rows by name.
      aria-label={t("trendingCardLabel", {
        symbol,
        rank,
        change: signed ?? t("changePending"),
        timeframe: windowLabel,
      })}
      aria-current={selected ? "true" : undefined}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * STAGGER_S, STAGGER_CAP_S), duration: 0.28 }}
      className={`${CARD_BOX} flex cursor-pointer flex-col gap-[6px] rounded-[14px] border p-[10px] text-left transition-colors ${
        selected
          ? "border-accent/50 bg-white/6"
          : "hover:border-accent/50 border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <RankRing rank={rank} />
        <MemeCoin token={token} size={28} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-serif text-[13px] leading-[16px] font-semibold text-white">
            {symbol}
          </span>
          {/* The number is only the flash's trigger; the label is the
              string priceLabel draws everywhere else. */}
          <FlashPrice
            value={token.priceUsd === null ? NaN : Number(token.priceUsd)}
            className="tnum truncate font-sans text-[11px] leading-[12px] font-semibold"
          >
            {priceLabel(token.priceUsd)}
          </FlashPrice>
        </span>
      </span>

      <span className="flex min-w-0 items-center justify-between gap-2">
        {signed === null ? (
          <span className="ws-display text-[18px] leading-[18px] text-white/40">—</span>
        ) : (
          <span
            className={`ws-display tnum truncate text-[18px] leading-[18px] ${
              signed.startsWith("-") ? "text-down" : "text-up"
            }`}
          >
            {signed}
          </span>
        )}
        <MomentumTag momentum={momentumOf(change)} />
      </span>

      <WhatIfLine change={change} timeframe={timeframe} />

      <span className="mt-auto block">
        <HeatBar share={heat} />
      </span>
    </motion.button>
  );
}

// A card's footprint while trending loads. Decorative: the strip hides the
// whole row of them from assistive tech.
export function MemeTrendingCardSkeleton({ variant }: { variant: TrendingVariant }) {
  return (
    <div
      data-skeleton="trending-card"
      // A desk skeleton fills the strip's fixed height; a phone strip has no
      // height of its own, so its skeleton carries a real card's height.
      className={`${CARD_BOX} ${
        variant === "phone" ? "h-[var(--trending-card-h)]" : ""
      } animate-pulse rounded-[14px] bg-white/6`}
    />
  );
}
