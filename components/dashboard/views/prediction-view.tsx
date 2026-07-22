"use client";

import { ProgressBar } from "@/components/ui/progress-bar";
import { PREDICTIONS } from "@/lib/data/dashboard";
import { predictionPayout } from "@/lib/format";
import type { ConfirmPayload } from "@/components/dashboard/modal-types";
import type { Prediction } from "@/lib/types";

interface PredictionViewProps {
  onOpenConfirm: (confirm: ConfirmPayload) => void;
}

export function PredictionView({ onOpenConfirm }: PredictionViewProps) {
  const buy = (p: Prediction, yes: boolean): ConfirmPayload => ({
    eyebrow: "// Prediction",
    title: yes ? "Buy Yes" : "Buy No",
    sub: p.q,
    lines: [
      { k: "Position", v: yes ? "Yes" : "No", c: yes ? "#7CE7B0" : "#F6A5A5" },
      { k: "Price", v: yes ? p.yes : p.no },
      { k: "Stake", v: "$50.00" },
      { k: "Payout if right", v: `$${predictionPayout(50, yes ? p.yes : p.no)}`, c: "#A78BFA" },
    ],
    cta: yes ? `Buy Yes · ${p.yes}` : `Buy No · ${p.no}`,
    successTitle: "Position open",
    successMsg: `Your ${yes ? "Yes" : "No"} position is live. Track it in your portfolio.`,
  });

  return (
    <div className="max-w-[1180px] p-4 sm:p-7">
      <div className="text-[13px] font-normal text-white/55">{"// Prediction markets"}</div>
      <h2 className="ws-serif mt-2.5 text-[30px] tracking-[-0.02em]">Trade your conviction</h2>
      <div className="mt-[18px] grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
        {PREDICTIONS.map((p) => (
          <div key={p.q} className="ws-card flex flex-col rounded-[20px] p-5 sm:p-[22px]">
            <div className="mb-3.5 flex items-center justify-between">
              <span className="rounded-full border border-white/12 bg-white/7 px-[11px] py-1 text-[11px] text-white/75">
                {p.tag}
              </span>
              <span className="text-xs text-white/45">{p.vol}</span>
            </div>
            <div className="flex-1 font-sans text-[17px] leading-[1.3] font-medium">{p.q}</div>
            <div className="mt-2 flex items-center gap-2.5">
              <span className="ws-serif text-accent text-[30px]">{p.yes}</span>
              <span className="text-[13px] text-white/50">Yes</span>
            </div>
            <div className="mt-1.5">
              <ProgressBar pct={p.pct} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => onOpenConfirm(buy(p, true))}
                className="border-up/35 bg-up/16 text-up hover:bg-up/22 cursor-pointer rounded-[11px] border p-[11px] font-sans text-[13.5px] font-semibold whitespace-nowrap"
              >
                Buy Yes · {p.yes}
              </button>
              <button
                onClick={() => onOpenConfirm(buy(p, false))}
                className="border-down/30 bg-down/12 text-down hover:bg-down/18 cursor-pointer rounded-[11px] border p-[11px] font-sans text-[13.5px] font-semibold whitespace-nowrap"
              >
                Buy No · {p.no}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
