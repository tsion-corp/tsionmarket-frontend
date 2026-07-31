"use client";

import { useState } from "react";
import { PriceChart } from "@/components/ui/price-chart";
import { useChart } from "@/hooks/use-chart";
import type { ChartRange } from "@/lib/coingecko";

const RANGES: ChartRange[] = ["1D", "1W", "1M", "1Y", "ALL"];

interface AssetChartProps {
  coingeckoId: string | null;
  up?: boolean;
  height?: number;
  allowCandles?: boolean;
  defaultType?: "area" | "candles";
}

export function AssetChart({
  coingeckoId,
  up = true,
  height = 260,
  allowCandles = true,
  defaultType = "area",
}: AssetChartProps) {
  const [range, setRange] = useState<ChartRange>("1M");
  const [type, setType] = useState<"area" | "candles">(defaultType);
  const { points, loading, error } = useChart(coingeckoId, range, type);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        {allowCandles ? (
          <div className="flex rounded-full border border-white/10 bg-white/5 p-0.5">
            {(["area", "candles"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`cursor-pointer rounded-full px-2.5 py-1 font-sans text-[11.5px] font-medium capitalize transition-colors ${
                  type === t ? "bg-accent/20 text-accent" : "text-white/50 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`cursor-pointer rounded-lg px-2.5 py-1 font-sans text-xs font-medium transition-colors ${
                range === r ? "bg-accent/16 text-white" : "text-white/45 hover:text-white"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="relative" style={{ height }}>
        {error || (!loading && points.length === 0) ? (
          <div className="grid h-full place-items-center text-[13px] font-normal text-white/40">
            Chart unavailable
          </div>
        ) : loading ? (
          <div className="grid h-full place-items-center text-[13px] font-normal text-white/40">
            Loading chart…
          </div>
        ) : (
          <PriceChart points={points} type={type} height={height} up={up} />
        )}
      </div>
    </div>
  );
}
