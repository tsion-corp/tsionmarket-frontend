"use client";

import { useMemo, useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { AssetChart } from "@/components/ui/asset-chart";
import { Eyebrow } from "@/components/ui/eyebrow";
import { TradeModeTabs, type TradeMode } from "@/components/dashboard/trade/trade-mode-tabs";
import { SwapPanel } from "@/components/dashboard/trade/swap-panel";
import { LimitPanel } from "@/components/dashboard/trade/limit-panel";
import { PerpsPanel } from "@/components/dashboard/trade/perps-panel";
import { usePrices } from "@/hooks/use-prices";
import { usePortfolio } from "@/hooks/use-portfolio";
import { formatUsd } from "@/lib/trade/math";
import { coingeckoId } from "@/lib/coingecko";
import {
  findAsset,
  networkForSymbol,
  PERP_ASSETS,
  SWAP_TOKENS,
  TRADE_PRICE_SYMBOLS,
  type SwapChainKey,
  type TradeAsset,
} from "@/lib/trade/assets";
import type { DetailPayload } from "@/components/dashboard/modal-types";

interface TradeSectionProps {
  onOpenDetail: (detail: DetailPayload) => void;
}

const STABLES = new Set(["USDC", "USDT"]);
const TICKER = ["SOL", "BTC", "ETH"];

function pickBase(
  mode: TradeMode,
  pay: TradeAsset,
  receive: TradeAsset,
  market: TradeAsset
): string {
  if (mode === "perps") return market.symbol;
  if (!STABLES.has(receive.symbol)) return receive.symbol;
  if (!STABLES.has(pay.symbol)) return pay.symbol;
  return receive.symbol;
}

export function TradeSection({ onOpenDetail }: TradeSectionProps) {
  const [mode, setMode] = useState<TradeMode>("swap");
  const [network, setNetwork] = useState<SwapChainKey>("solana");
  const [pay, setPay] = useState<TradeAsset>(SWAP_TOKENS.solana[0]);
  const [receive, setReceive] = useState<TradeAsset>(SWAP_TOKENS.solana[1]);
  const [market, setMarket] = useState<TradeAsset>(PERP_ASSETS[0]);

  const netTokens = SWAP_TOKENS[network];
  const prices = usePrices(TRADE_PRICE_SYMBOLS);
  const portfolio = usePortfolio();

  const balances = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of portfolio.tokens) map[t.symbol] = (map[t.symbol] ?? 0) + t.balance;
    return map;
  }, [portfolio.tokens]);

  // Switching network resets the pair to that network's default USDC -> native.
  const changeNetwork = (next: SwapChainKey) => {
    setNetwork(next);
    setPay(SWAP_TOKENS[next][0]);
    setReceive(SWAP_TOKENS[next][1]);
  };

  const flip = () => {
    setPay(receive);
    setReceive(pay);
  };

  const base = pickBase(mode, pay, receive, market);

  const openChip = (asset: TradeAsset) => {
    const price = prices[asset.symbol] ?? 0;
    onOpenDetail({
      sym: asset.symbol,
      name: asset.name,
      sub: `${asset.symbol} · live market price`,
      price: formatUsd(price),
      chg: "Live",
      bg: asset.bg,
      stats: [
        { k: "Mark price", v: formatUsd(price) },
        { k: "Symbol", v: asset.symbol },
        { k: "Price source", v: "Alchemy" },
      ],
      cta: `Trade ${asset.symbol}`,
      onCta: () => {
        setMode("swap");
        const homeNet = networkForSymbol(asset.symbol);
        const toks = SWAP_TOKENS[homeNet];
        setNetwork(homeNet);
        setPay(toks.find((t) => t.symbol === "USDC") ?? toks[0]);
        setReceive(toks.find((t) => t.symbol === asset.symbol) ?? toks[1]);
      },
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1520px] p-4 sm:p-6 lg:p-8">
      <Eyebrow>Trade</Eyebrow>

      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="ws-serif text-[26px]">Trade</h2>
        <div className="flex flex-wrap gap-2">
          {TICKER.map((sym) => {
            const asset = findAsset(sym);
            if (!asset) return null;
            const price = prices[sym] ?? 0;
            return (
              <button
                key={sym}
                onClick={() => openChip(asset)}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pr-3 pl-2 transition-colors hover:bg-white/10"
              >
                <AssetIcon sym={sym} bg={asset.bg} size={18} />
                <span className="font-sans text-[13px] font-medium">{sym}</span>
                <span className="tnum text-[13px] font-normal text-white/60">
                  {price > 0 ? formatUsd(price) : "—"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 min-[980px]:grid-cols-[minmax(0,440px)_1fr]">
        <div className="ws-card p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_70px_-30px_rgba(0,0,0,0.8)] sm:p-5">
          <TradeModeTabs active={mode} onChange={setMode} />
          <div className="mt-4">
            {mode === "swap" ? (
              <SwapPanel
                network={network}
                pay={pay}
                receive={receive}
                onNetwork={changeNetwork}
                onPay={setPay}
                onReceive={setReceive}
                onFlip={flip}
                prices={prices}
              />
            ) : null}
            {mode === "limit" ? (
              <LimitPanel
                pay={pay}
                receive={receive}
                onPay={setPay}
                onReceive={setReceive}
                onFlip={flip}
                prices={prices}
                balances={balances}
                assets={netTokens}
              />
            ) : null}
            {mode === "perps" ? (
              <PerpsPanel market={market} onMarket={setMarket} prices={prices} />
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="ws-card p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2.5">
              <AssetIcon sym={base} bg={findAsset(base)?.bg ?? "#333"} size={30} />
              <div className="min-w-0 flex-1">
                <div className="font-sans text-[15px] font-semibold">{base}-USD</div>
                <div className="text-xs font-normal text-white/50">
                  {findAsset(base)?.name ?? base}
                </div>
              </div>
              <div className="ws-serif tnum text-[19px]">{formatUsd(prices[base] ?? 0)}</div>
            </div>
            <AssetChart coingeckoId={coingeckoId(base)} allowCandles />
          </div>

          <div className="ws-card p-4 sm:p-5">
            {mode === "perps" ? (
              <>
                <div className="ws-serif mb-1.5 text-[17px]">Trade with care</div>
                <p className="text-[13px] leading-[1.55] font-normal text-white/65">
                  Mark and liquidation prices update live from the market. Leverage magnifies both
                  gains and losses. Liquidation is an estimate using a 0.5% maintenance margin.
                  Perps trading is coming soon; the figures here are a live preview.
                </p>
              </>
            ) : (
              <>
                <div className="ws-serif mb-1.5 text-[17px]">Always the best price</div>
                <p className="text-[13px] leading-[1.55] font-normal text-white/65">
                  Swap on Solana, Base, Arbitrum and Polygon. Solana routes live through Jupiter and
                  the EVM networks through LI.FI, each staying on its own chain for the sharpest
                  rate. Every swap settles in your own wallet.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
