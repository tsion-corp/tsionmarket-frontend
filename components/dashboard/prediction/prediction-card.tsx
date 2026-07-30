import { useTranslations } from "next-intl";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { Prediction } from "@/lib/types";

interface PredictionCardProps {
  prediction: Prediction;
  onBuy: (yes: boolean) => void;
}

export function PredictionCard({ prediction: p, onBuy }: PredictionCardProps) {
  const t = useTranslations("prediction");
  return (
    <div className="ws-beam ws-card relative flex h-full flex-col overflow-hidden rounded-[20px]">
      {p.image ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          {/* Polymarket serves market art from S3; next/image would need each
              host allowlisted, so use a plain img like the other remote logos.
              A 16:9 box renders the mix of banners and square logos cleanly. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.image} alt="" loading="lazy" className="h-full w-full object-cover" />
          {/* Fade the image into the card body so the tag/volume row reads. */}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,12,14,0.15),rgba(12,12,14,0.85))]" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-5 pb-2.5">
            <span className="rounded-full border border-white/14 bg-black/45 px-[11px] py-1 text-xs font-normal text-white/85 backdrop-blur-sm">
              {p.tag}
            </span>
            <span className="text-xs font-normal text-white/70">{p.vol}</span>
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col p-5 sm:p-[22px]">
        {p.image ? null : (
          <div className="mb-3.5 flex items-center justify-between">
            <span className="rounded-full border border-white/12 bg-white/7 px-[11px] py-1 text-xs font-normal text-white/75">
              {p.tag}
            </span>
            <span className="text-xs font-normal text-white/45">{p.vol}</span>
          </div>
        )}
        <div className="flex-1 font-sans text-[17px] leading-[1.3] font-medium">{p.q}</div>
        <div className="mt-2 flex items-center gap-2.5">
          <span className="ws-display text-accent text-[30px]">{p.yes}</span>
          <span className="text-[13px] font-normal text-white/50">{t("yesLabel")}</span>
        </div>
        <div className="mt-1.5">
          <ProgressBar pct={p.pct} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => onBuy(true)}
            className="border-up/35 bg-up/16 text-up hover:bg-up/22 cursor-pointer rounded-[11px] border p-[11px] font-sans text-[13.5px] font-semibold whitespace-nowrap"
          >
            {t("buyYes", { price: p.yes })}
          </button>
          <button
            onClick={() => onBuy(false)}
            className="border-down/30 bg-down/12 text-down hover:bg-down/18 cursor-pointer rounded-[11px] border p-[11px] font-sans text-[13.5px] font-semibold whitespace-nowrap"
          >
            {t("buyNo", { price: p.no })}
          </button>
        </div>
      </div>
    </div>
  );
}
