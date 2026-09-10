"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { MemeCoin } from "@/features/trade/components/meme-bits";
import type { MemeTradeInput, TradePhase } from "@/features/trade/hooks/use-meme-trade";
import { displaySymbol } from "@/lib/buy";
import { friendlyError } from "@/lib/errors";
import { isValidTradeAmount, type MemeToken, type SwapPreview } from "@/lib/meme/api";
import { exceedsHeld } from "@/lib/meme/sell-amount";
import { fromBaseUnits } from "@/lib/trade/math";

// The sell side of the desktop memecoin trade panel: the quantity field sized
// off the wallet's holding, the quote's numbers, and the Sell action.
//
// Presentational. It holds no query and calls no endpoint; the parent passes
// the quote in and the executor down, because the quote and the swap belong to
// the trade hook, not to a panel.
//
// Every amount here is a base-unit bigint or the decimal string that maps to
// one. The wallet's holding of a memecoin routinely runs past 2^53 base units
// (nine or eighteen decimals against a supply in the trillions), so a float
// anywhere on this path loses real digits of the user's balance, not
// theoretical ones.

const DECIMAL_INPUT = /^\d*\.?\d*$/;
const BASE_UNITS = /^\d+$/;
const SHORTCUTS = [25, 50, 75] as const;
// Above this the quote is costing the seller enough that the number should
// read as a loss rather than as a neutral detail.
const HIGH_IMPACT_BPS = 100;

export interface MemeSellPanelProps {
  token: MemeToken;
  /** The wallet's exact holding in base units, as the portfolio reports it. */
  balanceRaw: string;
  /** Decimals the holding is denominated in. Defaults to the token's. */
  balanceDecimals?: number;
  /** Controlled amount, a human decimal string, so the parent can debounce it. */
  amount: string;
  onAmountChange: (amount: string) => void;
  /** The indicative quote for `amount`, or null while there is none. */
  preview?: SwapPreview | null;
  previewLoading?: boolean;
  previewError?: unknown;
  /** Runs the sell. Takes exactly what the meme trade hook's `trade` takes. */
  onSell: (input: MemeTradeInput) => Promise<void>;
  /** The trade hook's phase and error, when the caller wires them through. */
  phase?: TradePhase;
  error?: string | null;
}

// A base-unit string is an integer. Anything else is an upstream defect, and
// the panel refuses to guess at a holding it cannot read.
function parseBaseUnits(raw: string): bigint | null {
  const cleaned = raw.trim();
  return BASE_UNITS.test(cleaned) ? BigInt(cleaned) : null;
}

// Integer division on base units. At 100 it returns the balance untouched, so
// a full exit sells the exact holding rather than a rounded version of it; a
// fraction floors to a whole base unit, which can never exceed the balance.
function amountForPercent(held: bigint, percent: number, decimals: number): string {
  return fromBaseUnits((held * BigInt(percent)) / 100n, decimals);
}

// Display edge, and only the display edge: group the whole part and clamp the
// fraction, on strings, so the balance label never routes through a float.
function formatHeld(held: bigint, decimals: number): string {
  const [whole = "0", frac = ""] = fromBaseUnits(held, decimals).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const shown = frac.slice(0, 4).replace(/0+$/, "");
  return shown ? `${grouped}.${shown}` : grouped;
}

export function MemeSellPanel({
  token,
  balanceRaw,
  balanceDecimals,
  amount,
  onAmountChange,
  preview = null,
  previewLoading = false,
  previewError,
  onSell,
  phase = "idle",
  error = null,
}: MemeSellPanelProps) {
  const t = useTranslations("meme");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const symbol = displaySymbol(token.symbol ?? "");
  const decimals = balanceDecimals ?? token.decimals ?? 18;
  const held = parseBaseUnits(balanceRaw);

  useEffect(() => {
    if (parseBaseUnits(balanceRaw) === null) {
      console.warn(`[meme] unreadable sell balance "${balanceRaw}" for ${token.address}`);
    }
  }, [balanceRaw, token.address]);

  const amountValid = isValidTradeAmount(amount, decimals);
  // A holding we cannot read covers nothing, so every amount is over it.
  const overBalance = amountValid && (held === null || exceedsHeld(amount, balanceRaw, decimals));
  const phaseBusy =
    phase === "linking" || phase === "quoting" || phase === "signing" || phase === "confirming";
  const busy = submitting || phaseBusy;
  const blocked = !token.sellEnabled || overBalance;
  const disabled = busy || blocked || !amountValid;

  const shownError = error ?? submitError;
  // A quote that never arrives leaves the details card empty with nothing to
  // explain it, so say so rather than let the row sit on a dash.
  const quoteFailed = previewError != null && amountValid && !overBalance && !previewLoading;

  function setPercent(percent: number) {
    if (held === null || held === 0n) return;
    setSubmitError(null);
    onAmountChange(amountForPercent(held, percent, decimals));
  }

  async function submit() {
    if (disabled) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSell({
        side: "SELL",
        tokenAddress: token.address,
        amount,
        chainId: token.chainId,
      });
    } catch (e) {
      setSubmitError(e);
    } finally {
      setSubmitting(false);
    }
  }

  const busyLabel = phaseBusy
    ? {
        linking: t("phaseLinking"),
        quoting: t("phaseQuoting"),
        signing: t("phaseSigning"),
        confirming: t("phaseConfirming"),
      }[phase as "linking" | "quoting" | "signing" | "confirming"]
    : t("sellingLabel");

  const ctaLabel = !token.sellEnabled
    ? t("sideDisabled")
    : overBalance
      ? t("notEnough")
      : busy
        ? busyLabel
        : t("ctaSell", { symbol });

  const impactBps = preview?.priceImpactBps ?? null;

  return (
    <section className="flex w-full flex-col gap-3">
      <div
        className={`bg-surface rounded-card border-2 p-4 ${
          overBalance ? "border-down/55" : "border-hairline"
        }`}
      >
        {/* Mona Sans semibold, the face the design sets this card's labels in. */}
        <div className="mb-3 flex items-center justify-between font-serif font-semibold">
          <span className="text-grey-400 text-[13px] tracking-[-0.39px]">{t("youSell")}</span>
          <span className="tnum text-grey-400 text-xs tracking-[-0.36px]">
            {t("balance", { amount: held === null ? "—" : formatHeld(held, decimals), symbol })}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <input
            value={amount}
            onChange={(e) => {
              const next = e.target.value.replace(/,/g, "");
              if (next === "" || DECIMAL_INPUT.test(next)) {
                setSubmitError(null);
                onAmountChange(next);
              }
            }}
            aria-label={t("youSell")}
            inputMode="decimal"
            placeholder="0"
            className="ws-chewy tnum min-w-0 flex-1 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#1c1c1c] py-1.5 pr-3 pl-1.5">
            <MemeCoin token={token} size={16} />
            <span className="font-serif text-[13px] font-semibold tracking-[-0.39px] text-white">
              {symbol}
            </span>
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          {SHORTCUTS.map((percent) => (
            <button
              key={percent}
              type="button"
              onClick={() => setPercent(percent)}
              disabled={held === null || held === 0n}
              className="bg-surface border-hairline cursor-pointer rounded-full border px-3 py-1 font-serif text-[11px] font-semibold text-white/70 hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {percent}%
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPercent(100)}
            disabled={held === null || held === 0n}
            className="bg-surface border-hairline cursor-pointer rounded-full border px-3 py-1 font-serif text-[11px] font-semibold text-white/70 hover:border-white/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("max")}
          </button>
        </div>
      </div>

      {/* The design edges this card in its own amber hairline, not the white
          one every other panel uses. #0a0a0a is the design's flat black for it;
          no surface token carries that value. */}
      <div className="border-hairline-amber rounded-card flex flex-col gap-2.5 border-2 bg-[#0a0a0a] p-4 font-serif text-sm font-semibold">
        <div className="flex items-center justify-between">
          <span className="text-grey-400">{t("youReceive")}</span>
          <span className="tnum text-white">
            {preview
              ? `${preview.expectedBuyAmountFormatted} ${displaySymbol(preview.buyToken.symbol ?? "")}`
              : previewLoading
                ? "…"
                : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-grey-400">{t("minReceived")}</span>
          <span className="tnum text-white">
            {preview
              ? `${preview.minimumBuyAmountFormatted} ${displaySymbol(preview.buyToken.symbol ?? "")}`
              : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-grey-400">{t("priceImpact")}</span>
          <span
            className={`tnum ${impactBps != null && impactBps >= HIGH_IMPACT_BPS ? "text-down" : "text-white"}`}
          >
            {impactBps != null ? `${(impactBps / 100).toFixed(2)}%` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-grey-400">{t("slippage")}</span>
          {/* The one row the design did not set in Mona Sans; production keeps it there. */}
          <span className="tnum font-serif font-medium text-white">
            {preview ? `${(preview.slippageBps / 100).toFixed(2)}%` : "—"}
          </span>
        </div>
      </div>

      {quoteFailed ? (
        <p className="text-down text-[12.5px] font-normal">
          {friendlyError(previewError, t("previewFailed"))}
        </p>
      ) : null}
      {shownError ? (
        <p role="alert" className="text-down text-[12.5px] font-normal">
          {friendlyError(shownError, t("orderFailed"))}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void submit()}
        disabled={disabled}
        className={`bg-sell h-12 w-full rounded-3xl font-sans text-base font-semibold text-white ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:opacity-90"
        }`}
      >
        {ctaLabel}
      </button>
    </section>
  );
}
