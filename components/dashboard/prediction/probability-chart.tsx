"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  type AreaData,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { priceToFraction } from "@/lib/prediction/format";
import type { ChartPoint } from "@/lib/prediction/types";

interface ProbabilityChartProps {
  points: ChartPoint[];
  height?: number;
}

// YES-probability area chart, reusing the same lightweight-charts setup as the
// perp price chart. The series is the YES probability as a 0..1 fraction; the
// axis is formatted as a percentage.
export function ProbabilityChart({ points, height = 260 }: ProbabilityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

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

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#7CE7B0",
      topColor: "rgba(124,231,176,0.25)",
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2,
      priceFormat: {
        type: "custom",
        formatter: (v: number) => `${Math.round(v * 100)}%`,
        minMove: 0.01,
      },
    });
    const data: AreaData[] = points.map((p) => ({
      time: p.t as UTCTimestamp,
      value: priceToFraction(p.yes),
    }));
    series.setData(data);
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [points, height]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
