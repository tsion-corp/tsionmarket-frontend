"use client";

import { useMemo, useState } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { useSpotMarkets, type SpotMarket } from "@/features/trade/hooks/use-spot-markets";
import { useSpotBuy } from "@/features/trade/hooks/use-spot-buy";
import { tokenBg } from "@/lib/trade/assets";
import { formatAmount, formatUsd } from "@/lib/trade/math";
import type { BuyPayload, DetailPayload } from "@/lib/modal-types";

interface SpotDeskProps {
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenBuy: (buy: BuyPayload) => void;
}

// The Market design's desktop Spot desk (Figma 173:41981): a token list on the
// left, an order panel on the right. Data is live (useSpotMarkets); the panel's
// amount + quick-fills are local and Buy opens the app's buy flow.

const QUICK = [10, 20, 50, 100, 100, 200];
const FEE_PCT = 0.0007;

function changeLabel(chg: number): string {
  const v = Number.isFinite(chg) ? chg : 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function compactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)}`;
}

export function SpotDesk({ onOpenDetail, onOpenBuy }: SpotDeskProps) {
  const { markets, loading } = useSpotMarkets();
  const [search, setSearch] = useState("");
  const [selectedSym, setSelectedSym] = useState<string | null>(null);
  const [amount, setAmount] = useState("500");
  const [orderType, setOrderType] = useState<"limit" | "market">("market");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? markets.filter((m) => `${m.symbol} ${m.name}`.toLowerCase().includes(q)) : markets;
  }, [markets, search]);

  const selected = markets.find((m) => m.symbol === selectedSym) ?? markets[0] ?? null;
  const amountNum = Number(amount) || 0;

  const openDetail = (m: SpotMarket) =>
    onOpenDetail({
      sym: m.symbol,
      name: m.name,
      sub: m.symbol,
      price: m.priceUsd > 0 ? formatUsd(m.priceUsd) : "—",
      chg: changeLabel(m.change24h),
      bg: tokenBg(m.symbol),
      coingeckoId: m.coingeckoId ?? undefined,
      up: m.change24h >= 0,
      logo: m.logo,
      candlesOnly: true,
      stats: [
        { k: "Price", v: m.priceUsd > 0 ? formatUsd(m.priceUsd) : "—" },
        { k: "24h", v: changeLabel(m.change24h) },
        { k: "Market cap", v: compactUsd(m.marketCap) },
      ],
      cta: `Buy ${m.name}`,
      onCta: () =>
        onOpenBuy({ symbol: m.symbol, name: m.name, priceUsd: m.priceUsd, logo: m.logo }),
    });

  // Buy executes inline from this panel — no pop-up — reusing the app's real
  // buy path (route resolution, balance/minimum checks, settlement toasts).
  const order = useSpotBuy({
    symbol: selected?.symbol ?? "",
    name: selected?.name ?? "",
    amount,
  });

  // A market row carries no wallet balance/address, so a real sell can't be
  // built from it here; open the asset's sheet, which resolves the holding and
  // offers sell when the user owns it.
  const sell = () => {
    if (selected) openDetail(selected);
  };

  return (
    <div className="mx-auto w-full max-w-[1048px] px-4 pt-4 sm:px-6">
      {/* Search */}
      <div className="flex h-[42px] w-full max-w-[394px] items-center gap-2 rounded-full border border-white/12 bg-white/5 px-3.5">
        <svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="shrink-0"
        >
          <circle cx="11" cy="11" r="7" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8" />
          <path
            d="m20 20-3.5-3.5"
            stroke="rgba(255,255,255,0.45)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search"
          className="min-w-0 flex-1 bg-transparent font-sans text-[13px] text-white outline-none placeholder:text-white/45"
        />
      </div>

      <div className="mt-4 flex flex-col items-start gap-4 lg:flex-row">
        {/* ── Token list ── */}
        <div className="w-full overflow-hidden rounded-[20px] border border-white/12 bg-white/5 lg:w-[602px]">
          <div className="flex items-center border-b border-white/7 px-4 py-3 text-[10.5px] font-medium tracking-[0.42px] text-white/40 uppercase">
            <span className="min-w-0 flex-1">Asset</span>
            <span className="w-[110px] text-right">Price</span>
            <span className="w-[80px] text-right">24h</span>
            <span className="w-[90px] text-right">Mcap</span>
          </div>

          {loading && rows.length === 0
            ? [0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex h-[57px] items-center gap-3 border-b border-white/7 px-4"
                >
                  <span className="size-[33px] shrink-0 animate-pulse rounded-[10px] bg-white/8" />
                  <span className="h-4 w-24 animate-pulse rounded bg-white/8" />
                </div>
              ))
            : rows.map((m) => {
                const up = m.change24h >= 0;
                return (
                  <button
                    key={m.symbol}
                    type="button"
                    onClick={() => setSelectedSym(m.symbol)}
                    className={`flex h-[57px] w-full cursor-pointer items-center border-b border-white/7 px-4 text-left transition-colors hover:bg-white/4 ${
                      selected?.symbol === m.symbol ? "bg-white/6" : ""
                    }`}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="shrink-0 overflow-hidden rounded-[10px]">
                        <AssetIcon
                          sym={m.symbol}
                          bg={tokenBg(m.symbol)}
                          logo={m.logo}
                          fallback="gradient"
                          size={33}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-sans text-[13.5px] font-medium text-white">
                          {m.symbol}
                        </span>
                        <span className="block truncate text-[11px] font-normal text-white/50">
                          {m.name}
                        </span>
                      </span>
                    </span>
                    <span className="tnum w-[110px] text-right font-sans text-[13px] font-semibold text-white">
                      {m.priceUsd > 0 ? formatUsd(m.priceUsd) : "—"}
                    </span>
                    <span
                      className={`tnum w-[80px] text-right text-[12.5px] font-semibold ${
                        up ? "text-[#7ce7b0]" : "text-[#f6a5a5]"
                      }`}
                    >
                      {changeLabel(m.change24h)}
                    </span>
                    <span className="tnum w-[90px] text-right text-[11px] font-medium text-white/50">
                      {compactUsd(m.marketCap)}
                    </span>
                  </button>
                );
              })}

          <a
            href="/manage-tokens"
            className="flex items-center justify-center border-t border-white/7 py-3 text-center font-sans text-[12px] font-medium text-[#f3f3f3] transition-colors hover:bg-white/4"
          >
            Manage tokens
          </a>
        </div>

        {/* ── Order panel ── */}
        <div className="flex w-full flex-col rounded-[24px] border border-white/12 bg-white/5 p-4 lg:h-[590px] lg:w-[430px]">
          {/* Pair + mode */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => selected && openDetail(selected)}
                className="flex h-10 cursor-pointer items-center gap-1.5 rounded-[16px] border-[1.5px] border-white/12 bg-white/5 px-3"
              >
                <span className="font-sans text-[15px] font-bold text-[#f4f4f4]">
                  {selected ? `${selected.symbol}/USDT` : "—"}
                </span>
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <span
                className={`text-[15px] font-bold ${selected && selected.change24h < 0 ? "text-[#fa8787]" : "text-[#7ce7b0]"}`}
              >
                {selected ? changeLabel(selected.change24h) : "—"}
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-[16px] border-[1.5px] border-white/12 bg-black/35 p-1">
              {(["limit", "market"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderType(t)}
                  className={`cursor-pointer rounded-[12px] px-4 py-1.5 text-[14px] font-bold capitalize transition-colors ${
                    orderType === t ? "bg-white/10 text-white" : "text-white/50"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* View chart */}
          <button
            type="button"
            onClick={() => selected && openDetail(selected)}
            className="mt-4 flex cursor-pointer items-center gap-1.5 self-start"
          >
            <span className="bg-accent size-1 rounded-full" />
            <svg width={13} height={13} viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M2 11l3-3 2.5 2L13 5"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-sans text-[14px] font-bold text-white">View Chart</span>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 9l6 6 6-6"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* You are paying */}
          <div className="mt-6 rounded-[20px] border-2 border-white/12 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold tracking-[-0.39px] text-[rgba(148,163,184,0.7)]">
                You are paying
              </span>
              <button
                type="button"
                onClick={() => order.balance > 0 && setAmount(String(Math.floor(order.balance)))}
                className="cursor-pointer text-[12px] font-semibold tracking-[-0.24px] text-[rgba(179,186,196,0.6)] hover:text-white/80"
              >
                Balance: {order.balanceLoading ? "…" : `${formatAmount(order.balance)} USDC`}
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="min-w-0 flex-1 bg-transparent font-sans text-[28px] font-bold text-[#f8fafc] outline-none"
              />
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#1c1c1c] px-2.5 py-1.5">
                <span className="size-4 rounded-full bg-[#2775ca]" />
                <span className="font-sans text-[13px] font-semibold tracking-[-0.39px] text-[#f8fafc]">
                  USDC
                </span>
                <svg width={8} height={8} viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="#f8fafc"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
          </div>

          {/* Quick amounts */}
          <div className="mt-3.5 flex flex-wrap gap-2.5">
            {QUICK.map((v, i) => (
              <button
                key={`${v}-${i}`}
                type="button"
                onClick={() => setAmount(String(v))}
                className="cursor-pointer rounded-full bg-white/5 px-5 py-2.5 font-sans text-[17px] font-semibold tracking-[-0.17px] text-white transition-colors hover:bg-white/10"
              >
                ${v}
              </button>
            ))}
          </div>

          {/* Summary + Buy/Sell */}
          <div className="mt-auto flex flex-col gap-6 pt-6">
            <div className="rounded-[20px] border-2 border-[rgba(234,188,60,0.1)] bg-[#0a0a0a] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[rgba(148,163,184,0.6)]">
                  Purchase Value
                </span>
                <span className="tnum text-[14px] font-semibold text-[#f8fafc]">
                  {amountNum.toLocaleString("en-US")} USDC
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[rgba(148,163,184,0.6)]">Fee</span>
                <span className="tnum text-[14px] text-[#f8fafc]">
                  {(amountNum * FEE_PCT).toFixed(2)} USDC
                </span>
              </div>
            </div>
            {order.disabledLabel ? (
              <p className="-mt-2 text-center text-[12.5px] font-medium text-white/45">
                {order.disabledLabel}
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void order.submit()}
                disabled={!order.canBuy}
                className="flex h-12 flex-1 cursor-pointer items-center justify-center rounded-[24px] bg-[#0ecb81] text-[16px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {order.pending ? "…" : "Buy"}
              </button>
              <button
                type="button"
                onClick={sell}
                className="flex h-12 flex-1 cursor-pointer items-center justify-center rounded-[24px] bg-[#d93025] text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Sell
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
