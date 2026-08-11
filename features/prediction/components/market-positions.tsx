"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMarketPositions } from "@/features/prediction/hooks/use-prediction-portfolio";
import { usePredictionActions } from "@/features/prediction/hooks/use-prediction-actions";
import { ClaimWindow } from "@/features/prediction/components/claim-window";
import { compactUsd, toNumber } from "@/features/prediction/lib/format";
import type { Market, Position, Side } from "@/features/prediction/lib/types";

// The connected wallet's positions in THIS market, on the side rail next to the
// buy panel. A Yes/No switch flips between the two sides; each shows the wallet's
// shares, cost basis, and (once resolved) a redeem button for the winning side.

interface MarketPositionsProps {
  market: Market;
}

export function MarketPositions({ market }: MarketPositionsProps) {
  const t = useTranslations("prediction");
  const [side, setSide] = useState<Side>("yes");
  const { data: positions, isLoading } = useMarketPositions(market.marketId.toString());
  const actions = usePredictionActions();

  const bySide = (s: Side): Position | undefined => (positions ?? []).find((p) => p.side === s);
  const current = bySide(side);
  const shares = current?.shares ?? 0n;
  const cost = current?.costUsdc ?? 0n;
  const hasAny = (positions ?? []).some((p) => p.shares > 0n);

  const resolved = market.status === "Resolved";
  const winningSide: Side | null = resolved
    ? market.outcome === "Yes"
      ? "yes"
      : market.outcome === "No"
        ? "no"
        : null
    : null;
  const canRedeem = resolved && winningSide === side && shares > 0n;

  if (!actions.wallet) {
    return (
      <div className="ws-card p-5 sm:p-6">
        <span className="ws-display mb-3 block text-[15px]">{t("yourPosition")}</span>
        <p className="py-4 text-center text-[13px] font-normal text-white/45">
          {t("positionConnect")}
        </p>
      </div>
    );
  }

  return (
    <div className="ws-card p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <span className="ws-display text-[15px]">{t("yourPosition")}</span>
        {/* Yes/No switch */}
        <div className="flex gap-1 rounded-lg bg-white/5 p-0.5">
          <SideTab active={side === "yes"} tone="up" onClick={() => setSide("yes")}>
            {t("yesLabel")}
          </SideTab>
          <SideTab active={side === "no"} tone="down" onClick={() => setSide("no")}>
            {t("noLabel")}
          </SideTab>
        </div>
      </div>

      {isLoading ? (
        <p className="py-4 text-center text-[13px] font-normal text-white/45">{t("loading")}</p>
      ) : shares === 0n ? (
        <p className="py-4 text-center text-[13px] font-normal text-white/45">
          {hasAny ? t("noPositionThisSide") : t("noPositionYet")}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          <Row label={t("positionShares")}>
            <span
              className={`font-semibold tabular-nums ${side === "yes" ? "text-up" : "text-down"}`}
            >
              {toNumber(shares).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </Row>
          <Row label={t("positionCost")}>
            <span className="text-white/85 tabular-nums">{compactUsd(cost)}</span>
          </Row>
          {resolved ? (
            <Row label={t("positionOutcome")}>
              <span className={winningSide === side ? "text-up" : "text-white/50"}>
                {winningSide === side ? t("positionWon") : t("positionLost")}
              </span>
            </Row>
          ) : null}

          {canRedeem ? (
            // Wrapped like every other redeem: a creator-resolved market is not
            // claimable until its challenge window closes, and redeeming inside
            // it reverts. This was the one path that still offered the button.
            <ClaimWindow marketId={market.marketId}>
              <button
                onClick={() => actions.redeem(market.marketId, side, shares)}
                disabled={actions.busy}
                className="border-up/45 bg-up/16 text-up mt-1 w-full cursor-pointer rounded-xl border py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              >
                {/* Said "Redeem winnings" throughout the transaction, so a slow
                    confirmation looked like a dead button. */}
                {actions.busy ? t("claiming") : t("redeemCta")}
              </button>
            </ClaimWindow>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SideTab({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone: "up" | "down";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const toneCls = tone === "up" ? "text-up" : "text-down";
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded-md px-3 py-1 text-[12px] font-semibold transition-colors ${
        active ? `bg-white/10 ${toneCls}` : "text-white/45 hover:text-white/70"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-white/50">{label}</span>
      {children}
    </div>
  );
}
