"use client";

import { useMemo, useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { AssetChart } from "@/components/ui/asset-chart";
import { Eyebrow } from "@/components/ui/eyebrow";
import { PerpsPanel } from "@/components/dashboard/trade/perps-panel";
import { usePrices } from "@/hooks/use-prices";
import { usePortfolio } from "@/hooks/use-portfolio";
import { formatUsd } from "@/lib/trade/math";
import { coingeckoId } from "@/lib/coingecko";
import { findAsset, PERP_ASSETS, TRADE_PRICE_SYMBOLS, type TradeAsset } from "@/lib/trade/assets";

export function TradeSection() {
  const [market, setMarket] = useState<TradeAsset>(PERP_ASSETS[0]);
  const prices = usePrices(TRADE_PRICE_SYMBOLS);
  const portfolio = usePortfolio();

  const balances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of portfolio.tokens) map[t.symbol] = (map[t.symbol] ?? 0) + t.balance;
    return map;
  }, [portfolio.tokens]);

  const base = market.symbol;

  return (
    // @container so the layout below responds to this panel's real width, not the
    // viewport. The fixed 248px sidebar means an iPad landscape (1024px viewport)
    // only leaves ~776px here, so a viewport breakpoint would wrongly go
    // two-column and crush the chart. A container query splits only when this
    // area is genuinely wide enough.
    <div className="@container mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>Perpetuals</Eyebrow>
      <h2 className="ws-display mt-3.5 text-[32px] tracking-[-0.01em]">Perpetuals</h2>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 @[860px]:grid-cols-[minmax(0,440px)_1fr]">
        <div className="ws-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_70px_-30px_rgba(0,0,0,0.8)] sm:p-5">
          <PerpsPanel market={market} prices={prices} balances={balances} />
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            {PERP_ASSETS.map((m) => {
              const on = m.symbol === market.symbol;
              const price = prices[m.symbol] ?? 0;
              return (
                <button
                  key={m.symbol}
                  onClick={() => setMarket(m)}
                  className={`flex flex-1 cursor-pointer flex-col gap-1 rounded-2xl border p-3 text-left transition-colors ${
                    on
                      ? "border-accent/40 bg-accent/10"
                      : "border-white/10 bg-white/4 hover:bg-white/6"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <AssetIcon sym={m.symbol} bg={m.bg} size={18} />
                    <span className="font-sans text-[13px] font-semibold">{m.symbol}-PERP</span>
                  </span>
                  <span className="tnum text-xs font-normal text-white/55">
                    {price > 0 ? formatUsd(price) : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ws-card p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <AssetIcon sym={base} bg={findAsset(base)?.bg ?? "#333"} size={30} />
              <div className="min-w-0 flex-1">
                <div className="font-sans text-[15px] font-semibold">{base}-PERP</div>
                <div className="text-xs font-normal text-white/50">
                  {findAsset(base)?.name ?? base}
                </div>
              </div>
              <div className="ws-display tnum text-[19px]">{formatUsd(prices[base] ?? 0)}</div>
            </div>
            <AssetChart coingeckoId={coingeckoId(base)} allowCandles />
          </div>

          <div className="ws-card p-4 sm:p-5">
            <div className="ws-display mb-1.5 text-[17px]">Trade with care</div>
            <p className="text-[13px] leading-[1.55] font-normal text-white/65">
              Mark and liquidation prices update live from the market. Leverage magnifies both gains
              and losses. Liquidation is an estimate using a 0.5% maintenance margin. Perps trading
              is coming soon; the figures here are a live preview.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
