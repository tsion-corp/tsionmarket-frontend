"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useMoney } from "@/components/ui/currency-select";
import { PerpConfirmModal, type ConfirmRow } from "@/components/dashboard/trade/perp-confirm-modal";
import {
  betSlip,
  isCashoutable,
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
  // Sells the position back to the market before resolution.
  onSell: (position: RawPosition) => void;
  selling: boolean;
}

// The detail view of a placed bet: the market, side, stake, shares, current
// value, payout if it wins, profit or loss, and resolution date. A resolved
// winning position can be claimed from here; an open one can be cashed out
// early, which sells the shares back to the market at the current price.
export function BetSlipSheet({ position, onClaim, claiming, onSell, selling }: BetSlipSheetProps) {
  const t = useTranslations("prediction");
  // Every dollar figure renders in the user's selected display currency.
  const money = useMoney();
  const signedMoney = (usd: number) => `${usd < 0 ? "-" : "+"}${money.format(Math.abs(usd))}`;
  // Selling gives up the winning payout and cannot be undone, so it goes
  // through an explicit confirm step rather than firing on the first tap.
  const [confirming, setConfirming] = useState(false);
  const slip = betSlip(position);
  const yes = slip.outcome.toLowerCase() === "yes";
  const outcomeColor = yes ? "#7CE7B0" : slip.outcome === "—" ? "#FFFFFF" : "#F6A5A5";

  const rows: StatLine[] = [
    { k: t("amountStaked"), v: money.format(slip.staked) },
    { k: t("shares"), v: slip.shares.toFixed(2) },
    { k: t("avgPrice"), v: priceCents(slip.avgPrice) },
    { k: t("currentValue"), v: money.format(slip.currentValue) },
    { k: t("payoutIfWins"), v: money.format(slip.payoutIfWins), c: "#7CE7B0" },
    {
      k: t("profitLoss"),
      v: `${signedMoney(slip.pnl)} (${slip.pnl >= 0 ? "+" : ""}${slip.pnlPct.toFixed(1)}%)`,
      c: slip.pnl >= 0 ? "#7CE7B0" : "#F6A5A5",
    },
  ];
  const claimable = isClaimable(slip.redeemable, slip.currentValue);
  const cashoutable = isCashoutable(slip.redeemable, slip.shares, slip.tokenId);
  const confirmRows: ConfirmRow[] = [
    { label: t("marketLabel"), value: slip.market },
    { label: t("shares"), value: slip.shares.toFixed(2) },
    { label: t("currentValue"), value: money.format(slip.currentValue) },
  ];
  const resolution = resolutionInfo(slip.redeemable, slip.resolvesAt, undefined, claimable);
  if (resolution) {
    // resolutionInfo returns English k/v pairs from pure, tested logic. Map the
    // known strings to translations here; a date value passes through as is.
    const statusValues: Record<string, string> = {
      "Resolved · you won": t("resolvedYouWon"),
      "Resolved · no win": t("resolvedNoWin"),
      "Awaiting result": t("awaitingResult"),
    };
    rows.push({
      k: resolution.k === "Status" ? t("statusLabel") : t("estResolutionLabel"),
      v: statusValues[resolution.v] ?? resolution.v,
    });
  }

  return (
    <div>
      <Eyebrow>{t("betSlip")}</Eyebrow>

      <div className="mt-3 flex items-center gap-[13px]">
        <AssetIcon sym={slip.outcome} bg="#26262b" size={40} logo={slip.icon} />
        <div className="min-w-0 flex-1">
          <div className="ws-display text-[19px] leading-tight">{slip.market}</div>
          <div className="mt-1 text-[12.5px] font-normal">
            <span style={{ color: outcomeColor }} className="font-medium">
              {slip.outcome}
            </span>
            <span className="text-white/45">
              {" "}
              · {t("avgShort", { price: priceCents(slip.avgPrice) })}
            </span>
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
          {claiming ? t("claiming") : t("claimAmount", { amount: money.format(slip.currentValue) })}
        </button>
      ) : cashoutable ? (
        <>
          <button
            onClick={() => setConfirming(true)}
            disabled={selling}
            className="text-ink mt-5 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {selling
              ? t("cashingOutPosition")
              : t("cashOutFor", { amount: money.format(slip.currentValue) })}
          </button>
          <p className="mt-2 text-center text-xs font-normal text-white/45">{t("cashOutNote")}</p>
        </>
      ) : (
        <p className="mt-5 text-center text-xs font-normal text-white/45">
          {slip.redeemable ? t("resolvedNothingToClaim") : t("settlesOnPolymarket")}
        </p>
      )}

      {confirming ? (
        <PerpConfirmModal
          title={t("confirmSellTitle")}
          rows={confirmRows}
          warning={t("confirmSellWarning")}
          cancelLabel={t("confirmCancel")}
          continueLabel={t("confirmContinue")}
          onCancel={() => setConfirming(false)}
          onContinue={() => {
            setConfirming(false);
            onSell(position);
          }}
        />
      ) : null}
    </div>
  );
}
