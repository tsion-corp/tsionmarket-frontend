"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useLpPositions } from "@/hooks/use-prediction-portfolio";
import { formatReserve } from "@/lib/prediction/format";
import type { Market } from "@/lib/prediction/types";

interface LiquidityPanelProps {
  market: Market;
}

// Liquidity, read only: the two pool reserves and the wallet's own LP stake.
//
// There are no controls here any more. Liquidity is seeded once at creation, and
// the creator's stake is returned to them automatically when the market resolves
// (see useLpAutoReturn), so there is nothing left for a person to add or
// withdraw by hand. The numbers stay because they are what a trader reads the
// depth of the book from.
export function LiquidityPanel({ market }: LiquidityPanelProps) {
  const t = useTranslations("prediction");
  const { data: lpPositions } = useLpPositions();

  const myLp = useMemo(
    () => lpPositions?.find((l) => l.marketId === market.marketId)?.lpShares ?? 0n,
    [lpPositions, market.marketId]
  );

  return (
    <div className="ws-card flex flex-col gap-3.5 p-5">
      <span className="ws-display text-[16px]">{t("liquidityTitle")}</span>

      {/* Reserves are formatted so a thin side never reads as an empty one.
          A market priced at 3¢/97¢ genuinely holds a fraction of a share on
          the expensive side; rounding that to a whole number printed "0". */}
      <div className="grid grid-cols-3 gap-2 text-[12px]">
        <div className="ws-inset p-2.5">
          <div className="text-white/45">{t("poolYes")}</div>
          <div className="tnum mt-0.5 font-medium">{formatReserve(market.rYes)}</div>
        </div>
        <div className="ws-inset p-2.5">
          <div className="text-white/45">{t("poolNo")}</div>
          <div className="tnum mt-0.5 font-medium">{formatReserve(market.rNo)}</div>
        </div>
        <div className="ws-inset p-2.5">
          <div className="text-white/45">{t("yourLp")}</div>
          <div className="tnum mt-0.5 font-medium">{formatReserve(myLp)}</div>
        </div>
      </div>

      {/* Only shown to someone who actually holds LP here, since it is a promise
          about their money and means nothing to anyone else. */}
      {myLp > 0n ? (
        <p className="text-[12px] leading-[1.5] font-normal text-white/45">
          {t("lpAutoReturnNote")}
        </p>
      ) : null}
    </div>
  );
}
