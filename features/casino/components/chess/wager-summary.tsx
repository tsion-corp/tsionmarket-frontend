"use client";

import { useTranslations } from "next-intl";
import { wagerBreakdown } from "@/features/casino/lib/api/cashier";

type RowTone = "default" | "win" | "bad" | "muted";

function Row({ label, value, tone = "default" }: { label: string; value: string; tone?: RowTone }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-sans text-[12px] font-normal text-white/50">{label}</span>
      <span
        className={`tnum font-sans text-[12.5px] ${
          tone === "win"
            ? "text-up font-semibold"
            : tone === "bad"
              ? "text-down font-semibold"
              : tone === "muted"
                ? "font-normal text-white/45"
                : "font-medium text-white/85"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// The money a stake moves, laid out plainly so a player sees exactly what
// happens before they commit: what locks now, what is left, and what the winner
// takes. Shared by the create and join screens so both read the same way. Both
// sides stake the same amount, so this is identical for creator and joiner.
export function WagerSummary({
  stakeUsdc,
  availableUsdc,
  feeBps,
}: {
  stakeUsdc: string;
  availableUsdc: string;
  feeBps: number;
}) {
  const t = useTranslations("casino.chess.stake");
  const b = wagerBreakdown(stakeUsdc, availableUsdc, feeBps);
  const pct = feeBps / 100;

  return (
    <div className="ws-inset flex flex-col gap-2 rounded-[12px] px-3.5 py-3">
      <Row label={t("summaryStake")} value={`${stakeUsdc} USDC`} />
      <Row label={t("summaryYouLock")} value={`${b.youLock} USDC`} />
      <Row
        label={t("summaryAfter")}
        value={`${b.balanceAfter} USDC`}
        tone={b.sufficient ? "default" : "bad"}
      />
      <div className="my-0.5 h-px bg-white/8" />
      <Row label={t("summaryWinner")} value={`${b.winnerReceives} USDC`} tone="win" />
      <Row label={t("summaryFee", { pct })} value={`${b.fee} USDC`} tone="muted" />
    </div>
  );
}
