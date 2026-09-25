"use client";

import { useEffect, useRef } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { InfoIcon } from "@/components/ui/icons";
import { MemeScreenerFilters } from "@/features/trade/components/meme-screener-filters";
import {
  METRIC_KEYS,
  MemeSortMenu,
  directionKey,
} from "@/features/trade/components/meme-sort-menu";
import { compactUsd } from "@/lib/meme/format";
import {
  MEME_TIMEFRAMES,
  SCREENER_METRICS,
  TIMEFRAME_SCOPED,
  type ScreenerFilters,
  type ScreenerMetric,
  type ScreenerPresetId,
  type ScreenerSort,
} from "@/lib/meme/screener";
import type { MemeTimeframe } from "@/lib/meme/types";

// The screener toolbar (ADR-2026-09-15-meme-trending-screener §3): timeframe
// pills, Sort, Filters, a chip per applied bound or sort, and the hints. On the
// desk it is one row of fixed height, so the list under it can fit its rows
// against a height that never changes. On the phone it wraps. Sort and Filters
// each open a modal, on both surfaces.

/** Pixels. The chips scroll sideways inside this row rather than adding a second one. */
export const SCREENER_TOOLBAR_DESK_HEIGHT = 36;

export interface BoundValueFormat {
  number: (n: number) => string;
  age: (unit: "ageMinutes" | "ageHours" | "ageDays", count: string) => string;
}

/**
 * A bound as its chip shows it. Money from a thousand up goes compact; below
 * that the canonical string is shown as it is, because compact notation rounds
 * a memecoin price such as 0.00001 to "$0". Counts are grouped, and age takes
 * the largest unit that divides it exactly, so the chip never rounds a bound.
 */
export function boundValueText(
  metric: ScreenerMetric,
  value: string,
  format: BoundValueFormat
): string {
  switch (metric) {
    case "marketCap":
    case "price":
    case "volume":
    case "liquidity":
      return value.split(".")[0].length >= 4 ? compactUsd(value) : `$${value}`;
    case "transactions":
    case "traders":
      return format.number(Number(value));
    case "age": {
      const minutes = Number(value);
      if (value.includes(".") || minutes === 0)
        return format.age("ageMinutes", format.number(minutes));
      if (minutes % 1440 === 0) return format.age("ageDays", format.number(minutes / 1440));
      if (minutes % 60 === 0) return format.age("ageHours", format.number(minutes / 60));
      return format.age("ageMinutes", format.number(minutes));
    }
  }
}

interface MemeScreenerToolbarProps {
  variant: "desk" | "phone";
  timeframe: MemeTimeframe;
  onTimeframeChange: (tf: MemeTimeframe) => void;
  filters: ScreenerFilters;
  count: number;
  preset: ScreenerPresetId | null;
  onApply: (bounds: ScreenerFilters["bounds"]) => void;
  onSortChange: (sort: ScreenerSort | null) => void;
  onPreset: (id: ScreenerPresetId) => void;
  onClearBound: (metric: ScreenerMetric, side: "min" | "max") => void;
  onClearAll: () => void;
  /** A search is showing. The controls stay usable; a note says the filters wait. */
  paused: boolean;
}

interface Chip {
  key: string;
  text: string;
  onRemove: () => void;
}

export function MemeScreenerToolbar(props: MemeScreenerToolbarProps) {
  const { variant, timeframe, filters, count, paused } = props;
  const t = useTranslations("memeScreener");
  const formatter = useFormatter();
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const phone = variant === "phone";

  // The phone's track can be narrower than its pills, and the default 24h sits
  // at its far end, so the pill in force is scrolled into view.
  useEffect(() => {
    const region = trackRef.current;
    const pill = region?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!phone || !region || !pill) return;
    if (pill.offsetLeft < region.scrollLeft) region.scrollLeft = pill.offsetLeft;
    else if (pill.offsetLeft + pill.offsetWidth > region.scrollLeft + region.clientWidth)
      region.scrollLeft = pill.offsetLeft + pill.offsetWidth - region.clientWidth;
  }, [phone, timeframe]);

  const format: BoundValueFormat = {
    number: (n) => formatter.number(n),
    age: (unit, value) => t(unit, { count: value }),
  };

  const singleChip = (metric: ScreenerMetric, side: "min" | "max", value: string): Chip => ({
    key: metric,
    text: t(side === "min" ? "chipMin" : "chipMax", {
      label: t(METRIC_KEYS[metric]),
      value: boundValueText(metric, value, format),
    }),
    onRemove: () => props.onClearBound(metric, side),
  });

  const chips: Chip[] = [];
  for (const metric of SCREENER_METRICS) {
    const { min, max } = filters.bounds[metric] ?? {};
    const hasMin = min !== undefined && min !== "";
    const hasMax = max !== undefined && max !== "";
    const label = t(METRIC_KEYS[metric]);
    if (hasMin && hasMax) {
      chips.push({
        key: metric,
        text: t("chipRange", {
          label,
          min: boundValueText(metric, min, format),
          max: boundValueText(metric, max, format),
        }),
        onRemove: () => {
          props.onClearBound(metric, "min");
          props.onClearBound(metric, "max");
        },
      });
    } else if (hasMin) {
      chips.push(singleChip(metric, "min", min));
    } else if (hasMax) {
      chips.push(singleChip(metric, "max", max));
    }
  }
  const { sort } = filters;
  if (sort !== null) {
    chips.push({
      key: "sort",
      text: t("sortApplied", {
        metric: t(METRIC_KEYS[sort.by]),
        direction: t(directionKey(sort.by, sort.order)),
      }),
      onRemove: () => props.onSortChange(null),
    });
  }

  // A removed chip takes its button with it, so focus moves to a neighbour, or
  // to Filters when none is left, instead of falling back to the page. Filters
  // is found by its own marker: both it and Sort open a dialog now, and Sort
  // comes first in the row.
  const focusAfterRemoval = (index: number | null) => {
    const root = rootRef.current;
    if (!root) return;
    const removes = Array.from(root.querySelectorAll<HTMLElement>("[data-chip-remove]"));
    const next = index === null ? undefined : (removes[index + 1] ?? removes[index - 1]);
    (next ?? root.querySelector<HTMLElement>("[data-screener-filters]"))?.focus();
  };

  const scopedBound = SCREENER_METRICS.some((metric) => {
    const bound = filters.bounds[metric];
    return TIMEFRAME_SCOPED.has(metric) && (Boolean(bound?.min) || Boolean(bound?.max));
  });
  const hints = [
    paused ? t("pausedBySearch") : null,
    scopedBound ? t("windowScopedHint", { timeframe: t(`timeframe${timeframe}`) }) : null,
  ].filter((hint): hint is string => hint !== null);

  const track = (
    <div
      role="group"
      aria-label={t("timeframeLabel")}
      className="border-hairline bg-surface inline-flex h-[36px] items-center gap-1 rounded-full border p-[3px]"
    >
      {MEME_TIMEFRAMES.map((tf) => {
        const on = tf === timeframe;
        return (
          <button
            key={tf}
            type="button"
            aria-pressed={on}
            onClick={() => props.onTimeframeChange(tf)}
            className={`tnum h-full cursor-pointer rounded-full px-3 font-sans text-[12px] font-semibold transition-colors ${
              on ? "bg-white text-black" : "text-white/60 hover:text-white"
            }`}
          >
            {t(`timeframe${tf}`)}
          </button>
        );
      })}
    </div>
  );

  const controls = (
    <>
      <MemeSortMenu variant={variant} sort={sort} onSortChange={props.onSortChange} />
      <MemeScreenerFilters
        variant={variant}
        filters={filters}
        count={count}
        preset={props.preset}
        onApply={props.onApply}
        onPreset={props.onPreset}
      />
    </>
  );

  const chipList = (
    <div
      data-region="screener-chips"
      className={
        phone
          ? "mt-2 flex flex-wrap items-center gap-1.5 empty:hidden"
          : "ws-no-scrollbar flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
      }
    >
      {chips.map((chip, index) => (
        <span
          key={chip.key}
          className="tnum flex h-[28px] shrink-0 items-center gap-0.5 rounded-full border border-white/15 bg-white/4 pr-0.5 pl-3 font-sans text-[11.5px] font-medium whitespace-nowrap text-white/80"
        >
          {chip.text}
          <button
            type="button"
            data-chip-remove
            aria-label={t("removeChip", { label: chip.text })}
            onClick={() => {
              focusAfterRemoval(index);
              chip.onRemove();
            }}
            className="grid size-6 cursor-pointer place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </span>
      ))}
      {count > 1 ? (
        <button
          type="button"
          onClick={() => {
            focusAfterRemoval(null);
            props.onClearAll();
          }}
          className="shrink-0 cursor-pointer rounded-full border border-white/15 px-3 py-1 font-sans text-[11px] font-medium whitespace-nowrap text-white/80 transition-colors hover:border-white/30 hover:text-white"
        >
          {t("clearAll")}
        </button>
      ) : null}
    </div>
  );

  // Always mounted, so a hint that appears is announced.
  const hintLine = (
    <p
      data-region="screener-hints"
      aria-live="polite"
      className={`flex items-center gap-1.5 font-sans text-[11.5px] font-normal text-white/45 ${
        phone ? "mt-2 items-start leading-[1.5] empty:mt-0" : "max-w-[40%] min-w-0 shrink"
      }`}
    >
      {hints.length > 0 ? (
        <>
          <span aria-hidden className={`shrink-0 ${phone ? "mt-[2px]" : ""}`}>
            <InfoIcon size={13} />
          </span>
          {/* On the desk the line truncates to keep the row one line; the
              title carries the whole text for a pointer. */}
          <span
            className={phone ? "" : "min-w-0 truncate"}
            title={phone ? undefined : hints.join(" ")}
          >
            {hints.map((hint, i) => (
              <span key={hint}>
                {i > 0 ? " " : null}
                {hint}
              </span>
            ))}
          </span>
        </>
      ) : null}
    </p>
  );

  if (phone) {
    return (
      <div ref={rootRef} data-region="screener-toolbar" className="flex flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <div ref={trackRef} className="ws-no-scrollbar relative min-w-0 flex-1 overflow-x-auto">
            {track}
          </div>
          {controls}
        </div>
        {chipList}
        {hintLine}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-region="screener-toolbar"
      // A floor, not a fixed height. The track and the two buttons come to
      // about 460px, and the desk's left column is near 480px at 1024px, so a
      // row that could not wrap drew them over each other. Wrapped, the row
      // grows by a line and the table below simply fits fewer rows.
      style={{ minHeight: SCREENER_TOOLBAR_DESK_HEIGHT }}
      className="flex min-w-0 shrink-0 flex-wrap items-center gap-2"
    >
      {track}
      {controls}
      {chipList}
      {hintLine}
    </div>
  );
}
