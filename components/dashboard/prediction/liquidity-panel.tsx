"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePredictionActions } from "@/hooks/use-prediction-actions";
import { useLpPositions } from "@/hooks/use-prediction-portfolio";
import { lpValue } from "@/lib/prediction/math";
import { toNumber } from "@/lib/prediction/format";
import { toBaseUnits } from "@/lib/trade/math";
import { USDC_DECIMALS, type Market } from "@/lib/prediction/types";

interface LiquidityPanelProps {
  market: Market;
}

// Liquidity provision (Intelligence/LP pillar): add USDC as liquidity to earn the
// trade fee, or withdraw an LP position. Remove shows a pro-rata preview of the
// reserves it would return.
export function LiquidityPanel({ market }: LiquidityPanelProps) {
  const t = useTranslations("prediction");
  const actions = usePredictionActions();
  const { data: lpPositions } = useLpPositions();
  const [mode, setMode] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");

  const myLp = useMemo(
    () => lpPositions?.find((l) => l.marketId === market.marketId)?.lpShares ?? 0n,
    [lpPositions, market.marketId]
  );

  const amountUnits = toBaseUnits(amount, USDC_DECIMALS);
  const removePreview = useMemo(
    () => lpValue(amountUnits, market.totalLp, market.rYes, market.rNo),
    [amountUnits, market.totalLp, market.rYes, market.rNo]
  );

  const overLp = mode === "remove" && amountUnits > myLp;
  const canSubmit = amountUnits > 0n && !actions.busy && !overLp;

  const submit = async () => {
    if (!canSubmit) return;
    const ok =
      mode === "add"
        ? await actions.addLiquidity({ marketId: market.marketId, usdcIn: amountUnits })
        : await actions.removeLiquidity({ marketId: market.marketId, lpIn: amountUnits });
    if (ok) setAmount("");
  };

  return (
    <div className="ws-card flex flex-col gap-3.5 p-5">
      <span className="ws-display text-[16px]">{t("liquidityTitle")}</span>

      <div className="grid grid-cols-3 gap-2 text-[12px]">
        <div className="ws-inset p-2.5">
          <div className="text-white/45">{t("poolYes")}</div>
          <div className="tnum mt-0.5 font-medium">{toNumber(market.rYes).toFixed(0)}</div>
        </div>
        <div className="ws-inset p-2.5">
          <div className="text-white/45">{t("poolNo")}</div>
          <div className="tnum mt-0.5 font-medium">{toNumber(market.rNo).toFixed(0)}</div>
        </div>
        <div className="ws-inset p-2.5">
          <div className="text-white/45">{t("yourLp")}</div>
          <div className="tnum mt-0.5 font-medium">{toNumber(myLp).toFixed(2)}</div>
        </div>
      </div>

      <div className="flex gap-2 text-[13px]">
        {(["add", "remove"] as const).map((mo) => (
          <button
            key={mo}
            onClick={() => {
              setMode(mo);
              setAmount("");
            }}
            className={`flex-1 cursor-pointer rounded-lg border py-2 font-medium transition-colors ${
              mode === mo
                ? "border-accent/45 bg-accent/12 text-white"
                : "border-white/10 bg-white/4 text-white/60 hover:bg-white/8"
            }`}
          >
            {mo === "add" ? t("addLiquidity") : t("removeLiquidity")}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[12.5px] font-normal text-white/55">
          <span>{mode === "add" ? t("amountUsdc") : t("amountLp")}</span>
          {mode === "remove" ? (
            <button
              type="button"
              onClick={() => setAmount(toNumber(myLp).toString())}
              className="text-accent cursor-pointer font-medium"
            >
              {t("maxShares", { count: toNumber(myLp).toFixed(2) })}
            </button>
          ) : null}
        </div>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="ws-inset w-full bg-transparent p-3 font-sans text-lg outline-none placeholder:text-white/35"
        />
      </label>

      {mode === "remove" && amountUnits > 0n ? (
        <div className="ws-inset flex items-center justify-between p-3 text-[13px] font-normal">
          <span className="text-white/55">{t("estReturn")}</span>
          <span className="tnum text-accent font-medium">
            {t("lpReturnPreview", {
              yes: toNumber(removePreview.yesOut).toFixed(2),
              no: toNumber(removePreview.noOut).toFixed(2),
            })}
          </span>
        </div>
      ) : null}

      {overLp ? <p className="text-down text-[13px] font-normal">{t("overLpBalance")}</p> : null}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="text-ink mt-1 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {actions.busy
          ? t("confirmingOnChain")
          : mode === "add"
            ? t("addLiquidity")
            : t("removeLiquidity")}
      </button>
    </div>
  );
}
