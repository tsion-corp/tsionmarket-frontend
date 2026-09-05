"use client";

import { useEffect, useRef } from "react";
import { ColorType, LineSeries, createChart, type IChartApi, type Time } from "lightweight-charts";
import { useHyperliquidFundingHistory } from "@/features/trade/hooks/use-hyperliquid-funding-history";

interface HyperliquidFundingChartProps {
  symbol: string;
  height: number | string;
}

// Market-wide funding rate over the last 7 days, plus its running cumulative
// — same two-series shape as Hyperliquid's own Funding tab. The rate lives
// on its own (left) scale since the cumulative line grows to a much larger
// magnitude over a week and would otherwise flatten the rate line to noise.
export function HyperliquidFundingChart({ symbol, height }: HyperliquidFundingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { history, loading } = useHyperliquidFundingHistory(symbol || null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || history.length === 0) return;

    const sorted = [...history].sort((a, b) => a.time - b.time);
    let cumulative = 0;
    const rateData = sorted.map((entry) => ({
      time: Math.floor(entry.time / 1000) as Time,
      value: Number(entry.fundingRate) * 100,
    }));
    const cumulativeData = sorted.map((entry) => {
      cumulative += Number(entry.fundingRate) * 100;
      return { time: Math.floor(entry.time / 1000) as Time, value: cumulative };
    });

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
      leftPriceScale: { visible: true, borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
      crosshair: { horzLine: { labelVisible: true }, vertLine: { labelVisible: true } },
      width: container.clientWidth,
      height: typeof height === "number" ? height : container.clientHeight,
    });

    const rateSeries = chart.addSeries(LineSeries, {
      color: "#7CE7B0",
      lineWidth: 1,
      priceScaleId: "left",
      title: "Funding Rate",
      priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(4)}%` },
    });
    rateSeries.setData(rateData);

    const cumulativeSeries = chart.addSeries(LineSeries, {
      color: "#ffffff",
      lineWidth: 2,
      priceScaleId: "right",
      title: "Cumulative Funding Rate",
      priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(2)}%` },
    });
    cumulativeSeries.setData(cumulativeData);

    chart.timeScale().fitContent();

    // Both dimensions, not just width — the container's own height can
    // change too now (measured row height from HyperliquidProPerps), and
    // lightweight-charts doesn't pick that up on its own the way a
    // percentage-height iframe would.
    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [history, height]);

  if (!symbol) {
    return (
      <div
        style={{ height }}
        className="grid place-items-center text-[13.5px] font-normal text-white/45"
      >
        No market selected
      </div>
    );
  }
  if (loading || history.length === 0) {
    return (
      <div
        style={{ height }}
        className="grid place-items-center text-[13.5px] font-normal text-white/45"
      >
        {loading ? "Loading funding history…" : "No funding history yet."}
      </div>
    );
  }

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
