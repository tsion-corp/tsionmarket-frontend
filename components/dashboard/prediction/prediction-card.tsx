import { ProgressBar } from "@/components/ui/progress-bar";
import type { Prediction } from "@/lib/types";

interface PredictionCardProps {
  prediction: Prediction;
  onBuy: (yes: boolean) => void;
}

export function PredictionCard({ prediction: p, onBuy }: PredictionCardProps) {
  return (
    <div className="ws-card flex h-full flex-col rounded-[20px] p-5 sm:p-[22px]">
      <div className="mb-3.5 flex items-center justify-between">
        <span className="rounded-full border border-white/12 bg-white/7 px-[11px] py-1 text-xs font-normal text-white/75">
          {p.tag}
        </span>
        <span className="text-xs font-normal text-white/45">{p.vol}</span>
      </div>
      <div className="flex-1 font-sans text-[17px] leading-[1.3] font-medium">{p.q}</div>
      <div className="mt-2 flex items-center gap-2.5">
        <span className="ws-serif text-accent text-[30px]">{p.yes}</span>
        <span className="text-[13px] font-normal text-white/50">Yes</span>
      </div>
      <div className="mt-1.5">
        <ProgressBar pct={p.pct} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => onBuy(true)}
          className="border-up/35 bg-up/16 text-up hover:bg-up/22 cursor-pointer rounded-[11px] border p-[11px] font-sans text-[13.5px] font-semibold whitespace-nowrap"
        >
          Buy Yes · {p.yes}
        </button>
        <button
          onClick={() => onBuy(false)}
          className="border-down/30 bg-down/12 text-down hover:bg-down/18 cursor-pointer rounded-[11px] border p-[11px] font-sans text-[13.5px] font-semibold whitespace-nowrap"
        >
          Buy No · {p.no}
        </button>
      </div>
    </div>
  );
}
