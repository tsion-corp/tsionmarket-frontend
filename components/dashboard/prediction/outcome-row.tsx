"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { compactUsd, priceToCents, priceToPct } from "@/lib/prediction/format";
import type { GroupOutcome } from "@/lib/prediction/types";

// One outcome (candidate) row inside an event — Polymarket's candidate list item:
// a small boxed icon, the label, its YES probability, volume, and Buy Yes / Buy
// No buttons that deep-link into the underlying binary market's trade UI with the
// side preselected. The image is rendered "small, fitted in a box" per the ask.

interface OutcomeRowProps {
  outcome: GroupOutcome;
}

export function OutcomeRow({ outcome }: OutcomeRowProps) {
  const t = useTranslations("prediction");
  const marketId = outcome.marketId.toString();
  const pct = Math.round(priceToPct(outcome.priceYes));

  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/[0.03]">
      {/* Boxed icon */}
      <Link href={`/prediction/${marketId}`} className="shrink-0">
        {outcome.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={outcome.imageUrl}
            alt=""
            className="h-10 w-10 rounded-lg border border-white/10 object-cover"
          />
        ) : (
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-white/5 text-[13px] font-semibold text-white/50">
            {outcome.label.slice(0, 1).toUpperCase()}
          </div>
        )}
      </Link>

      {/* Label + volume */}
      <Link href={`/prediction/${marketId}`} className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-white/90">{outcome.label}</p>
        <p className="text-[11.5px] font-normal text-white/40">
          {compactUsd(outcome.volumeUsdc)} {t("eventVolume")}
        </p>
      </Link>

      {/* Probability */}
      <span className="ws-display w-12 shrink-0 text-right text-[16px] text-white/85 tabular-nums">
        {pct}%
      </span>

      {/* Buy Yes / Buy No */}
      <div className="flex shrink-0 gap-2">
        <Link
          href={`/prediction/${marketId}?side=yes`}
          className="border-up/40 bg-up/12 text-up hover:bg-up/20 flex flex-col items-center rounded-lg border px-3 py-1.5 text-[12px] font-semibold"
        >
          <span className="text-[10px] font-medium opacity-70">{t("buyYes")}</span>
          {priceToCents(outcome.priceYes)}
        </Link>
        <Link
          href={`/prediction/${marketId}?side=no`}
          className="border-down/40 bg-down/12 text-down hover:bg-down/20 flex flex-col items-center rounded-lg border px-3 py-1.5 text-[12px] font-semibold"
        >
          <span className="text-[10px] font-medium opacity-70">{t("buyNo")}</span>
          {priceToCents(outcome.priceNo)}
        </Link>
      </div>
    </li>
  );
}
