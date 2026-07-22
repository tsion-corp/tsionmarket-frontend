"use client";

import Link from "next/link";
import { CoinBadge } from "@/components/ui/coin-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ArrowUpRightIcon, TrendIcon } from "@/components/ui/icons";
import { BALANCE_LINE, Sparkline } from "@/components/ui/sparkline";
import { ALLOCATION, HOLDINGS } from "@/lib/data/dashboard";
import { isUp, parseMoney } from "@/lib/format";
import type { DetailPayload, ConfirmPayload } from "@/components/dashboard/modal-types";
import type { Holding } from "@/lib/types";

interface PortfolioViewProps {
  onOpenFunds: () => void;
  onOpenSend: () => void;
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

export function PortfolioView({
  onOpenFunds,
  onOpenSend,
  onOpenDetail,
  onOpenConfirm,
}: PortfolioViewProps) {
  const buyConfirm = (h: Holding): ConfirmPayload => ({
    eyebrow: "// Trade",
    badgeSym: h.sym,
    badgeBg: h.bg,
    title: `Buy ${h.name}`,
    sub: `${h.amount} held`,
    lines: [
      { k: "You pay", v: "$500.00" },
      { k: "You receive", v: `${(500 / parseMoney(h.price)).toFixed(4)} ${h.sym}`, c: "#A78BFA" },
      { k: "Price", v: h.price },
      { k: "Fee", v: "$0.00 · no commission", c: "#7CE7B0" },
    ],
    cta: `Buy ${h.name}`,
    successTitle: "Order filled",
    successMsg: `Order filled. Your ${h.name} position is updated.`,
  });

  const openHolding = (h: Holding) =>
    onOpenDetail({
      sym: h.sym,
      name: h.name,
      sub: h.amount,
      price: h.price,
      chg: h.chg,
      bg: h.bg,
      stats: [
        { k: "Holdings", v: h.amount },
        { k: "Market price", v: h.price },
        { k: "24h change", v: h.chg },
        { k: "Position value", v: h.value },
      ],
      cta: `Trade ${h.name}`,
      onCta: () => onOpenConfirm(buyConfirm(h)),
    });

  return (
    <div className="max-w-[1180px] p-4 sm:p-7">
      <div className="text-[13px] font-normal text-white/55">{"// Portfolio"}</div>

      <div className="mt-3.5 grid grid-cols-1 gap-4 min-[720px]:grid-cols-[1.4fr_1fr]">
        <div className="ws-card p-5 sm:p-[26px]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[13px] text-white/60">Total balance</div>
              <div className="ws-serif tnum mt-1.5 text-[clamp(40px,5vw,58px)] leading-none tracking-[-0.02em]">
                $48,215.60
              </div>
              <div className="text-up mt-2.5 inline-flex items-center gap-1.5 text-sm">
                <TrendIcon size={15} />
                +$1,204.18 · +2.56% today
              </div>
            </div>
            <div className="flex w-full gap-2 min-[560px]:w-auto">
              <button
                onClick={onOpenFunds}
                className="text-ink flex-1 cursor-pointer rounded-xl bg-white px-4 py-2.5 font-sans text-[13px] font-semibold whitespace-nowrap hover:opacity-90 min-[560px]:flex-none"
              >
                Add funds
              </button>
              <button
                onClick={onOpenSend}
                className="flex-1 cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 font-sans text-[13px] font-medium whitespace-nowrap text-white hover:bg-white/10 min-[560px]:flex-none"
              >
                Send
              </button>
            </div>
          </div>
          <div className="relative mt-[22px] rounded-[14px] bg-[linear-gradient(180deg,rgba(167,139,250,0.12),rgba(167,139,250,0))]">
            <Sparkline id="balance" line={BALANCE_LINE} height={150} />
            <div className="absolute right-3.5 bottom-2.5 left-3.5 flex justify-between text-[11px] text-white/40">
              <span>1D</span>
              <span>1W</span>
              <span className="text-accent">1M</span>
              <span>1Y</span>
              <span>All</span>
            </div>
          </div>
        </div>

        <div className="ws-card flex flex-col p-5 sm:p-[26px]">
          <div className="text-[13px] text-white/60">Allocation</div>
          <div className="mt-4 flex flex-col gap-3.5">
            {ALLOCATION.map((a) => (
              <div key={a.name}>
                <div className="mb-1.5 flex justify-between text-[13.5px]">
                  <span className="text-white/85">{a.name}</span>
                  <span className="tnum text-white/55">{a.pct}%</span>
                </div>
                <ProgressBar pct={a.pct} color={a.color} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <Link
        href="/rwa"
        className="border-accent/30 mt-[18px] flex flex-wrap items-center gap-5 rounded-[22px] border bg-[linear-gradient(120deg,rgba(167,139,250,0.16),rgba(167,139,250,0.03))] px-5 py-5 sm:px-7 sm:py-6"
      >
        <div className="min-w-[240px] flex-1">
          <div className="text-accent text-xs font-semibold tracking-[0.03em]">
            REAL-WORLD ASSETS · SUB-APP
          </div>
          <div className="ws-serif mt-2 text-[22px] leading-[1.05] sm:text-[26px]">
            Own T-bills, tokenized stocks, gold &amp; real estate
          </div>
          <div className="mt-1.5 text-sm text-white/75">
            Institutional-grade yield onchain. Redeem to Naira anytime.
          </div>
        </div>
        <span className="text-ink inline-flex items-center gap-2 rounded-full bg-white px-[22px] py-[13px] font-sans text-sm font-semibold whitespace-nowrap">
          Explore RWA
          <ArrowUpRightIcon className="text-arrow" />
        </span>
      </Link>

      <div className="ws-card mt-[18px] overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-5 pb-3.5 sm:px-6">
          <span className="ws-serif text-[22px]">Your holdings</span>
          <span className="text-[13px] text-white/50">{HOLDINGS.length} assets</span>
        </div>
        <div className="grid grid-cols-[1.7fr_auto] gap-3.5 px-4 pb-2.5 text-[11.5px] tracking-[0.04em] text-white/40 uppercase min-[560px]:grid-cols-[2fr_1fr_1fr_1fr] sm:px-6">
          <span>Asset</span>
          <span className="hidden text-right min-[560px]:block">Price</span>
          <span className="hidden text-right min-[560px]:block">24h</span>
          <span className="text-right">Value</span>
        </div>
        {HOLDINGS.map((h) => (
          <button
            key={h.sym + h.name}
            onClick={() => openHolding(h)}
            className="grid w-full cursor-pointer grid-cols-[1.7fr_auto] items-center gap-3.5 border-t border-white/6 px-4 py-3.5 text-left transition-colors hover:bg-white/4 min-[560px]:grid-cols-[2fr_1fr_1fr_1fr] sm:px-6"
          >
            <span className="flex items-center gap-3">
              <CoinBadge sym={h.sym} bg={h.bg} />
              <span>
                <span className="block font-sans text-[14.5px] font-medium">{h.name}</span>
                <span className="block text-xs text-white/50">{h.amount}</span>
              </span>
            </span>
            <span className="tnum hidden text-right text-sm min-[560px]:block">{h.price}</span>
            <span
              className={`tnum hidden text-right text-[13.5px] min-[560px]:block ${isUp(h.chg) ? "text-up" : "text-down"}`}
            >
              {h.chg}
            </span>
            <span className="tnum text-right font-sans text-sm font-medium">{h.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
