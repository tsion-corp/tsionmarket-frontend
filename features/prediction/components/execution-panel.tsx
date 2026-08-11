"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePredictionActions } from "@/features/prediction/hooks/use-prediction-actions";
import { useTradePreview } from "@/features/prediction/hooks/use-prediction-quote";
import { usePredictionConsent } from "@/features/prediction/hooks/use-prediction-consent";
import { priceToCents, toNumber } from "@/features/prediction/lib/format";
import { toBaseUnits } from "@/lib/trade/math";
import { USDC_DECIMALS, type Market, type Side } from "@/features/prediction/lib/types";

interface ExecutionPanelProps {
  market: Market;
  initialSide?: Side;
}

const TOLERANCES = [10, 50, 100];

// The trade panel (Execution): pick a side and buy with USDC, with a live
// preview and slippage guard. Buy only — a position is held until the market
// resolves, then redeemed from the positions panel. There is no early exit, so
// selling shares back to the market is not offered. Quotes are pure and off the
// streamed reserves; the transaction recomputes its guard from a fresh on-chain
// read.
export function ExecutionPanel({ market, initialSide = "yes" }: ExecutionPanelProps) {
  const t = useTranslations("prediction");
  const { accepted, accept } = usePredictionConsent();
  const actions = usePredictionActions();
  const [side, setSide] = useState<Side>(initialSide);
  const [amount, setAmount] = useState("");
  const [tolerance, setTolerance] = useState(50);

  // Follow the side the card deep-linked to. Render-phase reset (the React
  // "adjust state when a prop changes" pattern) rather than an effect.
  const [trackedInitial, setTrackedInitial] = useState(initialSide);
  if (initialSide !== trackedInitial) {
    setTrackedInitial(initialSide);
    setSide(initialSide);
  }

  const amountUnits = toBaseUnits(amount, USDC_DECIMALS);
  const preview = useTradePreview(market, "buy", side, amountUnits, tolerance);

  const closed = market.status !== "Open";
  const canSubmit = amountUnits > 0n && preview.valid && !actions.busy && !closed;

  const submit = async () => {
    if (!canSubmit) return;
    const ok = await actions.buyShares({
      marketId: market.marketId,
      side,
      usdcIn: amountUnits,
      toleranceBps: tolerance,
    });
    if (ok) setAmount("");
  };

  if (!accepted) {
    return (
      <div className="ws-card flex flex-col gap-3 p-5">
        <div className="ws-display text-[19px]">{t("beforeYouTrade")}</div>
        <p className="text-[13px] leading-[1.55] font-normal text-white/70">{t("consentBody")}</p>
        <ul className="flex flex-col gap-1.5 text-[12.5px] font-normal text-white/55">
          <li>• {t("consentPointStake")}</li>
          <li>• {t("consentPointRegion")}</li>
          <li>• {t("consentPointFinal")}</li>
        </ul>
        <button
          onClick={accept}
          className="text-ink mt-1 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90"
        >
          {t("acceptRisks")}
        </button>
      </div>
    );
  }

  const yesPrice = priceToCents(market.priceYes);
  const noPrice = priceToCents(market.priceNo);

  return (
    <div className="ws-card flex flex-col gap-3.5 p-5">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide("yes")}
          className={`cursor-pointer rounded-xl border py-2.5 font-sans text-sm font-semibold transition-colors ${
            side === "yes"
              ? "border-up/45 bg-up/16 text-up"
              : "border-white/10 bg-white/4 text-white/60 hover:bg-white/8"
          }`}
        >
          {t("yesLabel")} · {yesPrice}
        </button>
        <button
          onClick={() => setSide("no")}
          className={`cursor-pointer rounded-xl border py-2.5 font-sans text-sm font-semibold transition-colors ${
            side === "no"
              ? "border-down/45 bg-down/16 text-down"
              : "border-white/10 bg-white/4 text-white/60 hover:bg-white/8"
          }`}
        >
          {t("noLabel")} · {noPrice}
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[12.5px] font-normal text-white/55">
          <span>{t("amountUsdc")}</span>
        </div>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="ws-inset w-full bg-transparent p-3 font-sans text-lg outline-none placeholder:text-white/35"
        />
      </label>

      <div className="flex items-center justify-between text-[12.5px]">
        <span className="text-white/55">{t("slippage")}</span>
        <div className="flex gap-1.5">
          {TOLERANCES.map((tol) => (
            <button
              key={tol}
              onClick={() => setTolerance(tol)}
              className={`cursor-pointer rounded-md border px-2 py-1 font-medium transition-colors ${
                tolerance === tol
                  ? "border-accent/45 bg-accent/12 text-white"
                  : "border-white/10 bg-white/4 text-white/55 hover:bg-white/8"
              }`}
            >
              {tol / 100}%
            </button>
          ))}
        </div>
      </div>

      {preview.valid ? (
        <div className="ws-inset flex items-center justify-between p-3 text-[13px] font-normal">
          <span className="text-white/55">{t("sharesOut")}</span>
          <span className="tnum text-accent font-medium">
            {t("sharesCount", { count: toNumber(preview.out).toFixed(2) })}
          </span>
        </div>
      ) : null}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className="text-ink mt-1 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {actions.busy
          ? t("confirmingOnChain")
          : closed
            ? t("marketClosedLabel")
            : t(side === "yes" ? "buyYesCta" : "buyNoCta")}
      </button>

      <p className="text-center text-[12px] font-normal text-white/45">{t("noEarlyExitNote")}</p>
    </div>
  );
}
