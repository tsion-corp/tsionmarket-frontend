"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { groupBaseUnits, parseBaseUnits } from "@/features/trade/components/meme-base-units";
import { MemeCoin } from "@/features/trade/components/meme-bits";
import type { MemeTradeInput, TradePhase } from "@/features/trade/hooks/use-meme-trade";
import { displaySymbol } from "@/lib/buy";
import { friendlyError } from "@/lib/errors";
import { isValidTradeAmount, type MemeToken, type SwapPreview } from "@/lib/meme/api";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import { estimateReceive, type BuyFunding } from "@/lib/meme/funding";
import { exceedsHeld, maxSellAmount } from "@/lib/meme/sell-amount";
import { belowMinimumBuy, minimumBuyUsd } from "@/lib/trade/minimums";

// USDC is the quote currency on both chains, so a buy is entered in USD at six
// decimals whatever the coin's own precision.
export const USD_DECIMALS = 6;

// Above this the quote is costing the trader enough that the number should read
// as a loss rather than as a neutral detail. Matches MemeSellPanel.
const HIGH_IMPACT_BPS = 100;

const DECIMAL_INPUT = /^\d*\.?\d*$/;

export interface TradeTicketProps {
  token: MemeToken;
  side: "BUY" | "SELL";
  amount: string;
  onAmountChange: (amount: string) => void;
  /** What a buy can draw on, and whether it needs the Solana move first. */
  funding: BuyFunding;
  /** The wallet's holding of the coin, in exact base units. */
  heldRaw: string;
  heldDecimals: number;
  preview: SwapPreview | null;
  previewLoading: boolean;
  previewError: unknown;
  onSubmit: (input: MemeTradeInput) => Promise<void>;
  phase: TradePhase;
  error: string | null;
}

// The quantity card, the quote breakdown and the action, for whichever side is
// selected. One component because the design draws one card that changes what
// it is denominated in: a buy is entered in USD and a sell in the coin.
//
// Every amount here is a base-unit bigint or the decimal string that maps to
// one, and every money figure on screen arrives already formatted, either from
// the quote or from a base-unit conversion at the display edge. Nothing on this
// path multiplies or divides a float.
export function TradeTicket({
  token,
  side,
  amount,
  onAmountChange,
  funding,
  heldRaw,
  heldDecimals,
  preview,
  previewLoading,
  previewError,
  onSubmit,
  phase,
  error,
}: TradeTicketProps) {
  const t = useTranslations("meme");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<unknown>(null);

  const buying = side === "BUY";
  const symbol = displaySymbol(token.symbol ?? "") || "?";
  const onSolana = token.chainId === SOLANA_CHAIN_ID;
  const held = parseBaseUnits(heldRaw);
  const decimals = buying ? USD_DECIMALS : heldDecimals;
  const amountValid = isValidTradeAmount(amount, decimals);

  // A holding we cannot read covers nothing, so every sell amount is over it.
  const overBalance = amountValid
    ? buying
      ? Number(amount) > funding.spendableUsd + 1e-9
      : held === null || exceedsHeld(amount, heldRaw, heldDecimals)
    : false;
  const belowMin = buying && amountValid && belowMinimumBuy(Number(amount), onSolana);
  const fundingBlocked = buying && funding.needsFunding && !funding.canFund;
  const sideEnabled = buying ? token.buyEnabled : token.sellEnabled;

  const phaseBusy =
    phase === "linking" || phase === "quoting" || phase === "signing" || phase === "confirming";
  const busy = submitting || phaseBusy;
  const blocked = !sideEnabled || overBalance || belowMin || fundingBlocked;
  const disabled = busy || blocked || !amountValid;

  // A Solana buy that still needs its USDC moved cannot be quoted: the trade
  // service prices it against the Solana wallet, which does not hold the money
  // yet. Show what the listed price would deliver until it does.
  const estimate =
    buying && funding.needsFunding
      ? estimateReceive(amountValid ? Number(amount) : 0, token.priceUsd)
      : null;
  const quoteFailed =
    previewError != null &&
    amountValid &&
    !blocked &&
    !previewLoading &&
    !(buying && funding.needsFunding);
  const shownError = error ?? submitError;

  const busyLabel = phaseBusy
    ? {
        linking: t("phaseLinking"),
        quoting: t("phaseQuoting"),
        signing: t("phaseSigning"),
        confirming: t("phaseConfirming"),
      }[phase as "linking" | "quoting" | "signing" | "confirming"]
    : buying
      ? t("buyingLabel")
      : t("sellingLabel");

  const ctaLabel = !sideEnabled
    ? t("sideDisabled")
    : overBalance || fundingBlocked
      ? t("notEnough")
      : belowMin
        ? t("minimumUsd", { amount: minimumBuyUsd(onSolana) })
        : busy
          ? busyLabel
          : buying
            ? t("ctaBuy", { symbol })
            : t("ctaSell", { symbol });

  const balanceLabel = buying
    ? t("balance", {
        amount: funding.spendableUsd.toLocaleString(undefined, { maximumFractionDigits: 2 }),
        symbol: "USDC",
      })
    : t("balance", {
        amount: held === null ? t("metricUnavailable") : groupBaseUnits(held, heldDecimals),
        symbol,
      });

  const impactBps = preview?.priceImpactBps ?? null;
  const receiveSymbol = preview ? displaySymbol(preview.buyToken.symbol ?? "") : symbol;

  function fillMax() {
    setSubmitError(null);
    if (buying) {
      // Cents, floored: a full-balance buy must never round to a cent more
      // than the wallet holds.
      onAmountChange((Math.floor(funding.spendableUsd * 100) / 100).toFixed(2));
      return;
    }
    // The exact holding, from base units, so a full exit sells what the wallet
    // has rather than a rounded version of it.
    if (held === null || held === 0n) return;
    onAmountChange(maxSellAmount(heldRaw, heldDecimals));
  }

  async function submit() {
    if (disabled) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        side,
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

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`bg-surface rounded-card border-2 p-4 ${
          overBalance || fundingBlocked ? "border-down/55" : "border-hairline"
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-2 font-serif font-semibold">
          <span className="text-grey-400 text-[13px] tracking-[-0.39px]">{t("quantity")}</span>
          <span className="tnum text-grey-400 truncate text-[12px] tracking-[-0.36px]">
            {balanceLabel}
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
            aria-label={t("quantity")}
            inputMode="decimal"
            placeholder="0"
            className="ws-chewy tnum min-w-0 flex-1 bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
          {/* The design draws a chevron on this pill. It stays off: the pair is
              fixed once a coin is picked, so the affordance would promise a
              menu that does not exist. Changing coin is the control at the top
              of the screen. */}
          <span className="bg-grey-800 flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pr-3 pl-1.5">
            {buying ? (
              <AssetIcon sym="USDC" bg="#2775ca" size={16} logo={null} />
            ) : (
              <MemeCoin token={token} size={16} />
            )}
            <span className="font-serif text-[13px] font-semibold tracking-[-0.39px] text-white">
              {buying ? "USDC" : symbol}
            </span>
          </span>
        </div>

        {/* Not in the design, and it stays anyway: a memecoin balance runs to
            eighteen decimals, so without it a full exit is untypable. Drawn at
            the size the desk draws it and grown to a 44px tap target with an
            inset pseudo-element, so the chip does not become the loudest thing
            in a card whose subject is the amount. */}
        <div className="mt-3 flex items-center">
          <button
            type="button"
            onClick={fillMax}
            disabled={buying ? funding.spendableUsd <= 0 : held === null || held === 0n}
            className="bg-surface border-hairline relative cursor-pointer rounded-full border px-3 py-1 font-serif text-[11px] font-semibold text-white/70 before:absolute before:inset-x-0 before:-inset-y-[12px] before:content-[''] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("max")}
          </button>
        </div>
      </div>

      {/* The design edges this card in its own amber hairline, not the white
          one every other panel uses. #0a0a0a is its flat black; no surface
          token carries that value. */}
      <div className="border-hairline-amber rounded-card flex flex-col gap-2.5 border-2 bg-[#0a0a0a] p-4 font-serif text-[13px] font-semibold">
        <div className="flex items-center justify-between gap-2">
          <span className="text-grey-400">{t("youReceive")}</span>
          <span className="tnum text-white">
            {preview
              ? `${preview.expectedBuyAmountFormatted} ${receiveSymbol}`
              : estimate != null
                ? `≈ ${estimate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`
                : previewLoading
                  ? "…"
                  : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-grey-400">{t("minReceived")}</span>
          <span className="tnum text-white">
            {preview ? `${preview.minimumBuyAmountFormatted} ${receiveSymbol}` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-grey-400">{t("priceImpact")}</span>
          <span
            className={`tnum ${
              impactBps != null && impactBps >= HIGH_IMPACT_BPS ? "text-down" : "text-white"
            }`}
          >
            {impactBps != null ? `${(impactBps / 100).toFixed(2)}%` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-grey-400">{t("slippage")}</span>
          <span className="tnum font-[family-name:var(--font-discovery)] font-medium text-white">
            {preview ? `${(preview.slippageBps / 100).toFixed(2)}%` : "—"}
          </span>
        </div>
      </div>

      {buying && funding.needsFunding && !fundingBlocked ? (
        <p className="text-[11.5px] font-normal text-white/45">{t("estimateNote")}</p>
      ) : null}
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
        className={`${buying ? "bg-buy" : "bg-sell"} h-12 w-full rounded-3xl font-[family-name:var(--font-sportsbook)] text-base font-semibold text-white ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
      >
        {ctaLabel}
      </button>
    </div>
  );
}
