"use client";

import { useTranslations } from "next-intl";
import { toast } from "@/lib/toast";

const COIN = "/kash-coin.jpg";

// Activity streams that will earn Kash. Balances are zero until the token
// service ships; the card is the product surface, wired first.
const ACTIVITY_KEYS = ["activityTrading", "activityGames", "activityReferrals"] as const;

export function KashCard() {
  const t = useTranslations("kash");
  const comingSoon = () => toast.info(t("comingSoon"));

  return (
    <div className="ws-card flex h-full flex-col p-5 sm:p-[26px]">
      <div className="flex items-center gap-2 text-[13px] font-normal text-white/60">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={COIN} alt="" className="h-6 w-6 rounded-full object-cover" />
        {t("balanceTitle")}
      </div>

      <div className="mt-2">
        <div className="ws-display tnum text-[34px] leading-none tracking-[-0.02em]">
          0 <span className="text-[20px] text-amber-200/90">KASH</span>
        </div>
        <div className="tnum mt-1 text-[12.5px] font-normal text-white/45">$0.00</div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={comingSoon}
          className="flex-1 cursor-pointer rounded-xl bg-amber-200 px-4 py-2.5 font-sans text-[13px] font-semibold text-amber-950 hover:opacity-90"
        >
          {t("buy")}
        </button>
        <button
          onClick={comingSoon}
          className="flex-1 cursor-pointer rounded-xl border border-white/14 bg-white/6 px-4 py-2.5 font-sans text-[13px] font-medium text-white hover:bg-white/10"
        >
          {t("sell")}
        </button>
      </div>

      <div className="mt-4 border-t border-white/8 pt-3">
        <div className="mb-2 text-[11px] font-normal tracking-[0.05em] text-white/40 uppercase">
          {t("activityTitle")}
        </div>
        <div className="flex flex-col gap-1.5">
          {ACTIVITY_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between text-[12.5px]">
              <span className="font-normal text-white/55">{t(key)}</span>
              <span className="tnum text-amber-200/80">+0 KASH</span>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11.5px] leading-[1.5] font-normal text-white/40">
          {t("activityHint")}
        </p>
      </div>
    </div>
  );
}
