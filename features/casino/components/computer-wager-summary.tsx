"use client";

import {
  COMPUTER_WAGER_FEE_BPS,
  chessComputerWagerBreakdown,
  computerWagerBreakdown,
} from "@/features/casino/lib/api/cashier";

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
  chessLevelEightTerms = false,
}: {
  stakeUsdc: string;
  availableUsdc: string;
  level: number;
  showDrawPayout?: boolean;
  chessLevelEightTerms?: boolean;
}) {
  const breakdown = chessLevelEightTerms
    ? chessComputerWagerBreakdown(stakeUsdc, availableUsdc, level)
    : computerWagerBreakdown(stakeUsdc, availableUsdc, level);
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
        label={
          chessLevelEightTerms
            ? `Win profit (${breakdown.rewardPercent}%)`
            : `House reward (${breakdown.rewardPercent}%)`
        }
        value={`${breakdown.houseExposure} USD`}
      />
      {breakdown.fee !== "0" ? (
        <SummaryRow
          label={`Fee (${COMPUTER_WAGER_FEE_BPS / 100}% of reward)`}
          value={`${breakdown.fee} USD`}
        />
      ) : null}
      <div className="h-px bg-white/8" />
      <SummaryRow label="Potential payout" value={`${breakdown.potentialPayout} USD`} emphasized />
      {showDrawPayout ? (
        <SummaryRow label="Draw return" value={`${breakdown.drawPayout} USD`} />
      ) : null}
      <SummaryRow label="Balance after stake" value={`${breakdown.balanceAfter} USD`} />
    </div>
  );
}
