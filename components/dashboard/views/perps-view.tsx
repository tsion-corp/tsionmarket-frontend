"use client";

import { useState } from "react";
import { PERP_MARKETS, POSITIONS } from "@/lib/data/dashboard";
import { isUp } from "@/lib/format";
import type { ConfirmPayload, DetailPayload } from "@/components/dashboard/modal-types";
import type { Position } from "@/lib/types";

interface PerpsViewProps {
  onOpenDetail: (detail: DetailPayload) => void;
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

export function PerpsView({ onOpenDetail, onOpenConfirm }: PerpsViewProps) {
  const [side, setSide] = useState<"long" | "short">("long");
  const long = side === "long";

  const openOrder = () =>
    onOpenConfirm({
      eyebrow: "// Review order",
      title: `${long ? "Open Long" : "Open Short"} · SOL-PERP`,
      sub: "10× leverage",
      lines: [
        { k: "Collateral", v: "2,000 USDC" },
        { k: "Position size", v: "20,000 USDC" },
        { k: "Entry price", v: "$174.20" },
        { k: "Liq. price", v: long ? "$158.31" : "$190.09", c: "#F6A5A5" },
      ],
      cta: long ? "Open Long · SOL" : "Open Short · SOL",
      successTitle: "Position open",
      successMsg: `Your ${side} position is open. Track it in Open positions.`,
    });

  const openPosition = (p: Position) =>
    onOpenDetail({
      sym: p.side === "LONG" ? "L" : "S",
      name: p.pair,
      sub: `${p.side === "LONG" ? "Long" : "Short"} · 10× leverage`,
      price: p.entry,
      chg: p.pnl,
      bg:
        p.side === "LONG"
          ? "linear-gradient(135deg,#7CE7B0,#2c8a63)"
          : "linear-gradient(135deg,#F6A5A5,#8a3d3d)",
      stats: [
        { k: "Side", v: p.side },
        { k: "Size", v: `${p.size} USDC` },
        { k: "Entry price", v: p.entry },
        { k: "Unrealized PnL", v: p.pnl },
      ],
      cta: "Close position",
      onCta: () =>
        onOpenConfirm({
          eyebrow: "// Manage position",
          title: `Close ${p.pair}`,
          sub: `${p.side === "LONG" ? "Long" : "Short"} · 10×`,
          lines: [
            { k: "Size", v: `${p.size} USDC` },
            { k: "Entry", v: p.entry },
            { k: "Realized PnL", v: p.pnl, c: "#7CE7B0" },
          ],
          cta: `Close ${p.pair}`,
          successTitle: "Position closed",
          successMsg: `Position closed. PnL of ${p.pnl} settled to your balance.`,
        }),
    });

  return (
    <div className="max-w-[1180px] p-4 sm:p-7">
      <div className="text-[13px] font-normal text-white/55">{"// Perpetual futures"}</div>
      <div className="mt-3.5 grid grid-cols-1 items-start gap-4 min-[900px]:grid-cols-[1fr_minmax(0,380px)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2.5">
            {PERP_MARKETS.map((m) => (
              <div
                key={m.pair}
                className={`min-w-[150px] flex-1 rounded-2xl border p-4 ${
                  m.active ? "border-accent/40 bg-accent/10" : "border-white/12 bg-white/4"
                }`}
              >
                <div className="flex items-center gap-[9px]">
                  <span className={`h-2 w-2 rounded-full ${isUp(m.chg) ? "bg-up" : "bg-down"}`} />
                  <span className="font-sans text-[15px] font-semibold">{m.pair}</span>
                </div>
                <div className="ws-serif tnum mt-2 text-[20px]">{m.price}</div>
                <div className={`mt-0.5 text-[13px] ${isUp(m.chg) ? "text-up" : "text-down"}`}>
                  {m.chg}
                </div>
              </div>
            ))}
          </div>

          <div className="ws-card p-5 sm:p-[22px]">
            <div className="mb-3 flex items-center justify-between">
              <span className="ws-serif text-[20px]">Open positions</span>
              <span className="text-xs text-white/50">{POSITIONS.length} open</span>
            </div>
            <div className="grid grid-cols-[1.5fr_auto] gap-3.5 pb-2 text-[11px] tracking-[0.04em] text-white/40 uppercase min-[560px]:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <span>Market</span>
              <span className="hidden text-right min-[560px]:block">Size</span>
              <span className="hidden text-right min-[560px]:block">Entry</span>
              <span className="text-right">PnL</span>
            </div>
            {POSITIONS.map((p) => (
              <button
                key={p.pair}
                onClick={() => openPosition(p)}
                className="grid w-full cursor-pointer grid-cols-[1.5fr_auto] items-center gap-3.5 border-t border-white/6 py-[13px] text-left transition-colors hover:bg-white/4 min-[560px]:grid-cols-[1.4fr_1fr_1fr_1fr]"
              >
                <span className="flex items-center gap-[9px]">
                  <span
                    className={`rounded-md px-[9px] py-[3px] text-[11px] font-bold ${
                      p.side === "LONG" ? "bg-up/14 text-up" : "bg-down/14 text-down"
                    }`}
                  >
                    {p.side}
                  </span>
                  <span className="font-sans text-sm font-medium">{p.pair}</span>
                </span>
                <span className="tnum hidden text-right text-[13.5px] min-[560px]:block">
                  {p.size}
                </span>
                <span className="tnum hidden text-right text-[13.5px] min-[560px]:block">
                  {p.entry}
                </span>
                <span
                  className={`tnum text-right text-[13.5px] ${isUp(p.pnl) ? "text-up" : "text-down"}`}
                >
                  {p.pnl}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="ws-card p-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => setSide("long")}
              className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
                long
                  ? "border-up/40 bg-up/16 text-up border"
                  : "border border-white/10 bg-white/4 text-white/60"
              }`}
            >
              Long
            </button>
            <button
              onClick={() => setSide("short")}
              className={`cursor-pointer rounded-xl p-3 font-sans text-sm font-semibold transition-colors ${
                !long
                  ? "border-down/40 bg-down/14 text-down border"
                  : "border border-white/10 bg-white/4 text-white/60"
              }`}
            >
              Short
            </button>
          </div>

          <div className="ws-inset mb-3 rounded-[14px] p-3.5">
            <div className="mb-1.5 text-xs text-white/55">Collateral (USDC)</div>
            <div className="ws-serif tnum text-[26px]">2,000</div>
          </div>

          <div className="mb-3.5">
            <div className="mb-2 flex justify-between text-xs text-white/55">
              <span>Leverage</span>
              <span className="text-accent font-semibold">10×</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/8">
              <div className="bg-accent h-full w-[20%] rounded-full" />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-white/40">
              <span>1×</span>
              <span>25×</span>
              <span>50×</span>
              <span>100×</span>
            </div>
          </div>

          <div className="mb-4 flex flex-col gap-2 text-[12.5px] text-white/60">
            <div className="flex justify-between">
              <span>Position size</span>
              <span className="text-white">20,000 USDC</span>
            </div>
            <div className="flex justify-between">
              <span>Entry price</span>
              <span className="text-white">$174.20</span>
            </div>
            <div className="flex justify-between">
              <span>Liq. price</span>
              <span className="text-down">{long ? "$158.31" : "$190.09"}</span>
            </div>
          </div>

          <button
            onClick={openOrder}
            className={`w-full cursor-pointer rounded-[14px] p-[15px] font-sans text-[15px] font-semibold whitespace-nowrap hover:opacity-90 ${
              long ? "bg-up text-up-ink" : "bg-down text-down-ink"
            }`}
          >
            {long ? "Open Long · SOL" : "Open Short · SOL"}
          </button>
        </div>
      </div>
    </div>
  );
}
