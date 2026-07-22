"use client";

import { useState } from "react";
import { ArrowDownIcon } from "@/components/ui/icons";
import { SWAP_ROUTES } from "@/lib/data/dashboard";
import type { ConfirmPayload } from "@/components/dashboard/modal-types";

const TABS = ["Swap", "Limit", "Recurring"] as const;

interface SwapViewProps {
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

export function SwapView({ onOpenConfirm }: SwapViewProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Swap");

  const review = () =>
    onOpenConfirm({
      eyebrow: "// Review swap",
      title: "Swap USDC → SOL",
      sub: "Best price, auto-routed",
      lines: [
        { k: "You pay", v: "1,000 USDC" },
        { k: "You receive", v: "5.7405 SOL", c: "#A78BFA" },
        { k: "Rate", v: "1 SOL = 174.20 USDC" },
        { k: "Price impact", v: "0.02%", c: "#7CE7B0" },
        { k: "Fee", v: "$0.00 · no commission", c: "#7CE7B0" },
      ],
      cta: "Confirm swap",
      successTitle: "Swap complete",
      successMsg: "Swapped 1,000 USDC for 5.7405 SOL. It's in your wallet.",
    });

  return (
    <div className="max-w-[1180px] p-4 sm:p-7">
      <div className="text-[13px] font-normal text-white/55">{"// Instant swap"}</div>
      <div className="mt-3.5 grid grid-cols-1 items-start gap-4 min-[900px]:grid-cols-[minmax(0,440px)_1fr]">
        <div className="ws-card p-[22px] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_30px_70px_-30px_rgba(0,0,0,0.8)]">
          <div className="mb-[18px] flex gap-1.5">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`cursor-pointer rounded-full px-4 py-2 font-sans text-[13px] font-medium transition-colors ${
                  tab === t
                    ? "bg-accent/14 text-white shadow-[inset_0_0_0_1px_rgba(167,139,250,0.3)]"
                    : "bg-transparent text-white/60 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="ws-inset p-4">
            <div className="mb-2.5 flex justify-between text-xs text-white/55">
              <span>You pay</span>
              <span>Balance 8,420 USDC</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="ws-serif tnum text-[32px]">1,000</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/7 px-3 py-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#2775CA] text-[11px] font-bold">
                  $
                </span>
                <span className="font-sans text-sm font-medium">USDC</span>
              </span>
            </div>
          </div>

          <div className="-my-2 flex justify-center">
            <span className="bg-panel text-accent z-[1] grid h-[34px] w-[34px] place-items-center rounded-[10px] border border-white/14">
              <ArrowDownIcon />
            </span>
          </div>

          <div className="ws-inset p-4">
            <div className="mb-2.5 flex justify-between text-xs text-white/55">
              <span>You receive</span>
              <span>1 SOL ≈ $174.20</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="ws-serif tnum text-accent text-[32px]">5.7405</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/7 px-3 py-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[linear-gradient(135deg,#9945FF,#14F195)] text-[11px] font-bold">
                  ◎
                </span>
                <span className="font-sans text-sm font-medium">SOL</span>
              </span>
            </div>
          </div>

          <button
            onClick={review}
            className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-[15px] font-sans text-[15px] font-semibold hover:opacity-90"
          >
            Swap
          </button>

          <div className="mt-3.5 flex flex-col gap-[9px] text-[12.5px] text-white/60">
            <div className="flex justify-between">
              <span>Rate</span>
              <span className="text-white/85">1 SOL = 174.20 USDC</span>
            </div>
            <div className="flex justify-between">
              <span>Price impact</span>
              <span className="text-up">0.02%</span>
            </div>
            <div className="flex justify-between">
              <span>Best price</span>
              <span className="text-white/85">Found for you automatically</span>
            </div>
          </div>
        </div>

        <div className="ws-card p-[22px]">
          <div className="ws-serif mb-3.5 text-[20px]">Always the best price</div>
          <p className="text-sm leading-[1.55] text-white/70">
            We check the whole market for you and lock in the sharpest rate. Nothing to configure.
          </p>
          <div className="mt-[18px] flex flex-col gap-2.5">
            {SWAP_ROUTES.map((r) => (
              <div
                key={r.name}
                className="flex items-center justify-between rounded-xl border border-white/7 bg-black/30 px-3.5 py-3 transition-colors hover:bg-white/4"
              >
                <span className="text-[13.5px] text-white/85">{r.name}</span>
                <span className="tnum text-accent text-[13px]">{r.pct}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
