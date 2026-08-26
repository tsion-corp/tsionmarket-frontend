"use client";

import { COMPUTER_WAGER_FEE_BPS, computerWagerBreakdown } from "@/features/casino/lib/api/cashier";

function SummaryRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="text-white/48">{label}</span>
      <span className={`tnum ${emphasized ? "text-up font-semibold" : "text-white/82"}`}>
        {value}
      </span>
    </div>
  );
}

export function ComputerWagerSummary({
  stakeUsdc,
  availableUsdc,
  level,
  showDrawPayout = false,
}: {
  stakeUsdc: string;
  availableUsdc: string;
  level: number;
  showDrawPayout?: boolean;
}) {
  const breakdown = computerWagerBreakdown(stakeUsdc, availableUsdc, level);
  if (!breakdown) return null;

  return (
    <div
      data-testid="computer-wager-summary"
      data-sensitive="balance"
      data-broadcast-suspend
      className="flex flex-col gap-2 rounded-[8px] border border-white/8 bg-black/12 px-3.5 py-3"
    >
      <SummaryRow label="Your stake" value={`${breakdown.youLock} USD`} />
      <SummaryRow
        label={`House reward (${breakdown.rewardPercent}%)`}
        value={`${breakdown.houseExposure} USD`}
      />
      <SummaryRow
        label={`Fee (${COMPUTER_WAGER_FEE_BPS / 100}% of reward)`}
        value={`${breakdown.fee} USD`}
      />
      <div className="h-px bg-white/8" />
      <SummaryRow label="Potential payout" value={`${breakdown.potentialPayout} USD`} emphasized />
      {showDrawPayout ? (
        <SummaryRow label="Completed draw returns" value={`${breakdown.drawPayout} USD`} />
      ) : null}
      <SummaryRow label="Balance after stake" value={`${breakdown.balanceAfter} USD`} />
    </div>
  );
}
