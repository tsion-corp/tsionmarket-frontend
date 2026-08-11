"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  createChart,
  LineSeries,
  type IChartApi,
  type LineData,
  type UTCTimestamp,
} from "lightweight-charts";
import { priceToFraction } from "@/features/prediction/lib/format";
import type { EventChartSeries } from "@/features/prediction/lib/types";

// Multi-line event chart — one YES-probability line per outcome over time (like
// Polymarket's Fed-decision chart with a line per bracket). Reuses the same
// lightweight-charts setup as the single-market ProbabilityChart, adding one
// LineSeries per outcome plus a colour legend.

interface EventChartProps {
  series: EventChartSeries[];
  height?: number;
}

// A stable, readable categorical palette (brand-neutral). Colours cycle if there
// are more outcomes than entries — fine for the long tail of low-% brackets.
const PALETTE = [
  "#7CE7B0",
  "#7AA2FF",
  "#F6A5A5",
  "#F4C77B",
  "#B79CFF",
  "#6FD6E0",
  "#E58FD6",
  "#9BE07C",
];

export function EventChart({ series, height = 260 }: EventChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const withData = series.filter((s) => s.points.length > 0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || withData.length === 0) return;

    const chart: IChartApi = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255,255,255,0.4)",
        fontFamily: "var(--font-body), sans-serif",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      crosshair: { horzLine: { labelVisible: true }, vertLine: { labelVisible: true } },
      localization: {
        priceFormatter: (value: number) => `${Math.round(value * 100)}%`,
      },
      width: container.clientWidth,
      height,
    });

    for (let i = 0; i < withData.length; i++) {
      const s = withData[i];
      const line = chart.addSeries(LineSeries, {
        color: PALETTE[i % PALETTE.length],
        lineWidth: 2,
        priceFormat: {
          type: "custom",
          formatter: (v: number) => `${Math.round(v * 100)}%`,
          minMove: 0.01,
        },
      });
      const data: LineData[] = s.points.map((p) => ({
        time: p.t as UTCTimestamp,
        value: priceToFraction(p.yes),
      }));
      line.setData(data);
    }
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [withData, height]);

  return (
    <div>
      <div ref={containerRef} style={{ height }} className="w-full" />
      {/* Colour legend, matching the line order. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {series.map((s, i) => (
          <span
            key={s.marketId.toString()}
            className="flex items-center gap-1.5 text-[12px] text-white/70"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
