"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMoney } from "@/components/ui/currency-select";
import { usePredictionActions } from "@/hooks/use-prediction-actions";
import { useTradePreview } from "@/hooks/use-prediction-quote";
import { usePredictionConsent } from "@/hooks/use-prediction-consent";
import { priceToCents, toNumber } from "@/lib/prediction/format";
import { toBaseUnits } from "@/lib/trade/math";
import { USDC_DECIMALS, type Market, type Side } from "@/lib/prediction/types";

interface ExecutionPanelProps {
  market: Market;
  initialSide?: Side;
}

const TOLERANCES = [10, 50, 100];

// The trade panel (Execution): pick a side, buy with USDC or sell shares, with a
// live preview and slippage guard. Quotes are pure and off the streamed reserves;
// the transaction recomputes its guard from a fresh on-chain read.
export function ExecutionPanel({ market, initialSide = "yes" }: ExecutionPanelProps) {
  const t = useTranslations("prediction");
  const money = useMoney();
  const { accepted, accept } = usePredictionConsent();
  const actions = usePredictionActions();
  const [side, setSide] = useState<Side>(initialSide);
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [tolerance, setTolerance] = useState(50);
  const [balance, setBalance] = useState<bigint>(0n);

  // Follow the side the card deep-linked to. Render-phase reset (the React
  // "adjust state when a prop changes" pattern) rather than an effect.
  const [trackedInitial, setTrackedInitial] = useState(initialSide);
  if (initialSide !== trackedInitial) {
    setTrackedInitial(initialSide);
    setSide(initialSide);
  }

  // Selling needs the wallet's share balance for the side to cap the input.
  useEffect(() => {
    let live = true;
    if (mode === "sell") {
      actions.shareBalance(market.marketId, side).then((b) => {
        if (live) setBalance(b);
      });
    }
    return () => {
      live = false;
    };
  }, [mode, side, market.marketId, actions]);

  const amountUnits = toBaseUnits(amount, USDC_DECIMALS);
  const preview = useTradePreview(market, mode, side, amountUnits, tolerance);

  const closed = market.status !== "Open";
  const overBalance = mode === "sell" && amountUnits > balance;
  const canSubmit = amountUnits > 0n && preview.valid && !actions.busy && !closed && !overBalance;

  const submit = async () => {
    if (!canSubmit) return;
    const ok =
      mode === "buy"
        ? await actions.buyShares({
            marketId: market.marketId,
            side,
            usdcIn: amountUnits,
            toleranceBps: tolerance,
          })
        : await actions.sellShares({
            marketId: market.marketId,
            side,
            sharesIn: amountUnits,
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

      <div className="flex gap-2 text-[13px]">
        {(["buy", "sell"] as const).map((mo) => (
          <button
            key={mo}
            onClick={() => {
              setMode(mo);
              setAmount("");
            }}
            className={`flex-1 cursor-pointer rounded-lg border py-2 font-medium transition-colors ${
              mode === mo
                ? mo === "sell"
                  ? "border-down/45 bg-down/16 text-down"
                  : "border-accent/45 bg-accent/12 text-white"
                : "border-white/10 bg-white/4 text-white/60 hover:bg-white/8"
            }`}
          >
            {mo === "buy" ? t("buyTab") : t("sellTab")}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[12.5px] font-normal text-white/55">
          <span>{mode === "buy" ? t("amountUsdc") : t("amountShares")}</span>
          {mode === "sell" ? (
            <button
              type="button"
              onClick={() => setAmount(toNumber(balance).toString())}
              className="text-accent cursor-pointer font-medium"
            >
              {t("maxShares", { count: toNumber(balance).toFixed(2) })}
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
          <span className="text-white/55">{mode === "buy" ? t("sharesOut") : t("usdcOut")}</span>
          <span className="tnum text-accent font-medium">
            {mode === "buy"
              ? t("sharesCount", { count: toNumber(preview.out).toFixed(2) })
              : money.format(toNumber(preview.out))}
          </span>
        </div>
      ) : null}

      {overBalance ? (
        <p className="text-down text-[13px] font-normal">{t("overShareBalance")}</p>
      ) : null}

      <button
        onClick={submit}
        disabled={!canSubmit}
        className={`mt-1 w-full cursor-pointer rounded-[14px] p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${
          mode === "sell" ? "bg-down text-white" : "text-ink bg-white"
        }`}
      >
        {actions.busy
          ? t("confirmingOnChain")
          : closed
            ? t("marketClosedLabel")
            : mode === "buy"
              ? t(side === "yes" ? "buyYesCta" : "buyNoCta")
              : t("sellCta")}
      </button>
    </div>
  );
}
