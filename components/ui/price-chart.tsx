"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  type AreaData,
  type CandlestickData,
  type IChartApi,
} from "lightweight-charts";
import type { AreaPoint, CandlePoint } from "@/hooks/use-chart";

interface PriceChartProps {
  points: (AreaPoint | CandlePoint)[];
  type?: "area" | "candles";
  height?: number;
  up?: boolean;
}

export function PriceChart({ points, type = "area", height = 260, up = true }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || points.length === 0) return;

    const accent = up ? "#7CE7B0" : "#F6A5A5";
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
      width: container.clientWidth,
      height,
    });

    if (type === "candles") {
      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#7CE7B0",
        downColor: "#F6A5A5",
        borderVisible: false,
        wickUpColor: "#7CE7B0",
        wickDownColor: "#F6A5A5",
      });
      series.setData(points as unknown as CandlestickData[]);
    } else {
      const series = chart.addSeries(AreaSeries, {
        lineColor: accent,
        topColor: up ? "rgba(124,231,176,0.25)" : "rgba(246,165,165,0.25)",
        bottomColor: "rgba(0,0,0,0)",
        lineWidth: 2,
      });
      series.setData(points as unknown as AreaData[]);
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
  }, [points, type, height, up]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
