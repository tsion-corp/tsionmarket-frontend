"use client";

import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import {
  betSlip,
  formatMoney,
  formatSignedMoney,
  isClaimable,
  priceCents,
  resolutionInfo,
  type RawPosition,
} from "@/lib/prediction";
import type { StatLine } from "@/components/dashboard/modal-types";

interface BetSlipSheetProps {
  position: RawPosition;
  onClaim: (conditionId: string) => void;
  claiming: boolean;
}

// The detail view of a placed bet: the market, side, stake, shares, current
// value, payout if it wins, profit or loss, and resolution date. Redeemable
// positions can be claimed straight from here.
export function BetSlipSheet({ position, onClaim, claiming }: BetSlipSheetProps) {
  const slip = betSlip(position);
  const yes = slip.outcome.toLowerCase() === "yes";
  const outcomeColor = yes ? "#7CE7B0" : slip.outcome === "—" ? "#FFFFFF" : "#F6A5A5";

  const rows: StatLine[] = [
    { k: "Amount staked", v: formatMoney(slip.staked) },
    { k: "Shares", v: slip.shares.toFixed(2) },
    { k: "Avg price", v: priceCents(slip.avgPrice) },
    { k: "Current value", v: formatMoney(slip.currentValue) },
    { k: "Payout if it wins", v: formatMoney(slip.payoutIfWins), c: "#7CE7B0" },
    {
      k: "Profit / loss",
      v: `${formatSignedMoney(slip.pnl)} (${slip.pnl >= 0 ? "+" : ""}${slip.pnlPct.toFixed(1)}%)`,
      c: slip.pnl >= 0 ? "#7CE7B0" : "#F6A5A5",
    },
  ];
  const claimable = isClaimable(slip.redeemable, slip.currentValue);
  const resolution = resolutionInfo(slip.redeemable, slip.resolvesAt, undefined, claimable);
  if (resolution) rows.push(resolution);

  return (
    <div>
      <Eyebrow>Bet slip</Eyebrow>

      <div className="mt-3 flex items-center gap-[13px]">
        <AssetIcon sym={slip.outcome} bg="#26262b" size={40} logo={slip.icon} />
        <div className="min-w-0 flex-1">
          <div className="ws-serif text-[19px] leading-tight">{slip.market}</div>
          <div className="mt-1 text-[12.5px] font-normal">
            <span style={{ color: outcomeColor }} className="font-medium">
              {slip.outcome}
            </span>
            <span className="text-white/45"> · {priceCents(slip.avgPrice)} avg</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-[11px] text-[13.5px] font-normal text-white/60">
        {rows.map((r) => (
          <div key={r.k} className="flex justify-between">
            <span>{r.k}</span>
            <span className="tnum" style={{ color: r.c ?? "#FFFFFF" }}>
              {r.v}
            </span>
          </div>
        ))}
      </div>

      {claimable && slip.conditionId ? (
        <button
          onClick={() => onClaim(slip.conditionId as string)}
          disabled={claiming}
          className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {claiming ? "Claiming…" : `Claim ${formatMoney(slip.currentValue)}`}
        </button>
      ) : (
        <p className="mt-5 text-center text-xs font-normal text-white/45">
          {slip.redeemable
            ? "This market has resolved. There's nothing to claim on this position."
            : "Settles on Polymarket when the market resolves."}
        </p>
      )}
    </div>
  );
}
