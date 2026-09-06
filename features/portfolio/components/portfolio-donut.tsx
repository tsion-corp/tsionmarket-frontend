"use client";

import { useTranslations } from "next-intl";
import { useMoney } from "@/components/ui/currency-select";
import { useBalanceVisibility } from "@/components/ui/balance-visibility";
import { SkeletonLine } from "@/components/ui/skeleton-line";
import {
  heldAssetCount,
  portfolioBreakdown,
  type BreakdownKey,
} from "@/features/portfolio/lib/breakdown";
import type { TokenBalance } from "@/hooks/use-portfolio";

// Ark is monochrome, so the slices separate by lightness rather than hue —
// brightest for cash, receding through the rest.
const SLICE_FILL: Record<BreakdownKey, string> = {
  cash: "#e8e8ea",
  coins: "#9b9ba1",
  realAssets: "#67676d",
  tokens: "#3f3f45",
};

const SIZE = 132;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Blank between arcs so neighbouring greys stay distinguishable. Round caps
// spend half the stroke past each end of the dash, so the gap has to clear the
// full stroke on top of the space it is meant to leave.
const GAP = STROKE + 6;

/**
 * The ring's footprint while the balance loads: the same 132px box and three
 * legend lines. Without it the whole block appeared only once tokens arrived,
 * and everything under the balance card dropped by the ring's full height on
 * every load.
 */
export function PortfolioDonutSkeleton() {
  return (
    <div className="flex items-center gap-4 min-[420px]:gap-6" aria-hidden="true">
      <div
        className="shrink-0 animate-pulse rounded-full border-[16px] border-white/8"
        style={{ width: SIZE, height: SIZE }}
      />
      <ul className="flex min-w-0 flex-1 flex-col gap-2.5 min-[420px]:gap-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-2.5 text-[13px]">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white/8" />
            <SkeletonLine width="w-20" />
            <SkeletonLine width="w-12" className="ml-auto hidden min-[420px]:inline-block" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Where the portfolio's money actually sits, as one ring with a legend. Replaces
// a price chart of the largest holding, which showed one asset's market rather
// than the shape of what the user owns.
export function PortfolioDonut({ tokens }: { tokens: TokenBalance[] }) {
  const t = useTranslations("balance");
  const money = useMoney();
  const { mask } = useBalanceVisibility();
  const slices = portfolioBreakdown(tokens);
  const count = heldAssetCount(tokens);

  // Each arc's dash and where it starts, derived rather than accumulated: a
  // counter mutated inside the map is a render-time reassignment, and there are
  // at most four slices so scanning the ones before is free.
  // A single slice owning the whole ring has no neighbour to separate from, and
  // subtracting a gap there would leave a visible notch in what should read as
  // one closed circle.
  const single = slices.length === 1;
  const arcs = slices.map((slice, i) => {
    const before = slices.slice(0, i).reduce((sum, s) => sum + s.share, 0);
    const span = slice.share * CIRCUMFERENCE;
    const length = single ? span : Math.max(span - GAP, 1);
    return {
      key: slice.key,
      dash: `${length} ${CIRCUMFERENCE - length}`,
      // Half the gap in, so the arc sits centred in the span it owns rather
      // than flush against the slice before it.
      start: -(before * CIRCUMFERENCE + (single ? 0 : GAP / 2)),
    };
  });

  return (
    // Ring and legend sit side by side at every width, the way the mobile app
    // reads. Stacking them below 420px pushed the legend under a centred ring
    // and made the card twice as tall as the app's.
    <div className="flex items-center gap-4 min-[420px]:gap-6">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          {/* Rotated so the first slice starts at twelve o'clock. */}
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={STROKE}
            />
            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={SLICE_FILL[arc.key]}
                strokeWidth={STROKE}
                strokeDasharray={arc.dash}
                strokeDashoffset={arc.start}
                strokeLinecap="round"
              />
            ))}
          </g>
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="ws-display tnum text-[26px] leading-none">{count}</div>
            <div className="mt-1 text-[11px] font-normal text-white/45">{t("assetsHeld")}</div>
          </div>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-2.5 min-[420px]:gap-2">
        {slices.length === 0 ? (
          <li className="text-[13px] font-normal text-white/45">{t("breakdownEmpty")}</li>
        ) : (
          slices.map((slice) => (
            <li key={slice.key} className="flex items-center gap-2.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: SLICE_FILL[slice.key] }}
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-normal text-white/70">
                {t(`slice_${slice.key}`)}
              </span>
              {/* The amount and share are the web's addition. Beside a ring on a
                  narrow phone they wrap the label onto two lines, so they only
                  appear once there is room for them. */}
              <span
                className="tnum hidden shrink-0 text-[13px] font-medium text-white min-[420px]:inline"
                data-sensitive="balance"
              >
                {mask(money.format(slice.valueUsd))}
              </span>
              <span className="tnum hidden w-9 shrink-0 text-right text-[12px] font-normal text-white/40 min-[420px]:inline">
                {Math.round(slice.share * 100)}%
              </span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
