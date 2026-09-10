"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { spotAmountStatus } from "@/features/trade/components/spot-amount-card";

// The two ends of the spot ticket. Buy and Sell are actions, so they carry the
// action tokens (bg-buy, bg-sell), never the price-delta colours.
//
// The two sides are gated separately, against different assets. Buying spends
// the pay token, so Buy is gated on the pay balance. Selling draws down the
// asset being sold and needs no pay balance at all, so gating Sell on the pay
// token would strand a user who holds the asset but little USDC: they could not
// close the position. A sell is the way out of a position, so its gate must be
// about the thing being sold and nothing else.
//
// Neither button is ever a silently dead control: whenever one is disabled a
// line says why and names the asset it is short of, and every button points at
// its reason through aria-describedby so it reaches a screen reader too.

export type SpotTradeSide = "buy" | "sell";

// An asset one side of the ticket draws on.
export interface SpotSideAsset {
  // Spendable balance, in this asset's own base units.
  balance: bigint;
  decimals: number;
  symbol: string;
}

// The asset Sell draws down. A union rather than a nullable balance, because
// `decimals` is only knowable from a holding: a market the wallet holds none of
// has no token record to read it from. Splitting the two cases keeps callers
// from inventing a decimals value for a balance that is never measured.
export type SpotSellAsset =
  | SpotSideAsset
  // The user holds none of it, or the holding has not loaded. Sell is disabled
  // and names the asset; it never falls back to the pay balance.
  | { balance: null; symbol: string };

export interface SpotTradeActionsProps {
  // The entered amount, as a decimal string. Handed back to the callback
  // untouched, so what executes is what was typed.
  amount: string;
  // What Buy spends. Checked against the amount in base units.
  pay: SpotSideAsset;
  // What Sell draws down. Omit it when there is no sell leg at all, e.g. before
  // a market is chosen: Sell is disabled and asks for a market rather than
  // reporting a balance it was never given.
  sell?: SpotSellAsset;
  onBuy: (amount: string) => void;
  onSell: (amount: string) => void;
  // The side currently executing, or null when nothing is in flight.
  pending?: SpotTradeSide | null;
}

export function SpotTradeActions({
  amount,
  pay,
  sell,
  onBuy,
  onSell,
  pending = null,
}: SpotTradeActionsProps) {
  const t = useTranslations("spot");
  const baseId = useId();
  const inFlight = pending !== null;

  // While an order is in flight both sides are locked, whatever the balances
  // say, so the amount cannot move under a signature.
  const waiting = inFlight ? t("stageWaiting") : null;

  // Why one side cannot act on the entered amount, or null when it can. The
  // message names the asset, because the two sides are short of different
  // things and a bare "Not enough balance" would point at the wrong one.
  const amountReason = (balance: bigint, decimals: number, symbol: string): string | null => {
    const status = spotAmountStatus(amount, balance, decimals);
    if (status === "ok") return null;
    if (status === "empty") return t("ctaEnterAmount");
    if (status === "above-balance") return t("ctaNoBalanceOf", { symbol });
    if (status === "too-precise") return t("amountTooPrecise", { symbol, decimals });
    return t("amountInvalid");
  };

  const buyReason = waiting ?? amountReason(pay.balance, pay.decimals, pay.symbol);

  const sellReason =
    waiting ??
    (sell === undefined
      ? t("ctaSelect")
      : sell.balance === null
        ? t("noSellBalance", { symbol: sell.symbol })
        : amountReason(sell.balance, sell.decimals, sell.symbol));

  // Both sides usually stall for the same reason (no amount yet, or an order in
  // flight). Saying it once under the pair reads better than printing the same
  // sentence twice.
  const shared = buyReason !== null && buyReason === sellReason;
  const sharedId = `${baseId}-both`;
  const buyReasonId = shared ? sharedId : `${baseId}-buy`;
  const sellReasonId = shared ? sharedId : `${baseId}-sell`;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <ActionButton
            label={t("buy")}
            tone="buy"
            busy={pending === "buy"}
            disabled={buyReason !== null}
            describedBy={buyReasonId}
            onClick={() => onBuy(amount)}
          />
          {shared ? null : <Reason id={buyReasonId} text={buyReason} />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <ActionButton
            label={t("sell")}
            tone="sell"
            busy={pending === "sell"}
            disabled={sellReason !== null}
            describedBy={sellReasonId}
            onClick={() => onSell(amount)}
          />
          {shared ? null : <Reason id={sellReasonId} text={sellReason} />}
        </div>
      </div>
      {shared ? <Reason id={sharedId} text={buyReason} /> : null}
    </div>
  );
}

// Always rendered, so aria-describedby resolves even when there is nothing to
// say. An empty reason is present but silent.
function Reason({ id, text }: { id: string; text: string | null }) {
  if (text === null) return <p id={id} aria-live="polite" className="sr-only" />;
  return (
    <p
      id={id}
      aria-live="polite"
      className="text-center text-[13px] font-medium text-[rgba(148,163,184,0.6)]"
    >
      {text}
    </p>
  );
}

function ActionButton({
  label,
  tone,
  busy,
  disabled,
  describedBy,
  onClick,
}: {
  label: string;
  tone: SpotTradeSide;
  busy: boolean;
  disabled: boolean;
  describedBy: string;
  onClick: () => void;
}) {
  // The design set the label in Inter; production keeps its body face, Geist.
  //
  // The button must not carry flex-1. Its parent is a column, so flex-1 would
  // set flex-basis: 0% on the vertical axis, which replaces h-12 as the flex
  // base size; the column is content-height, so the button collapsed to the
  // 24px line box instead of the 48px the design draws. It is a fixed-height
  // control: h-12 for the height, w-full for the width the column gives it,
  // and shrink-0 so a shorter parent can never squeeze it again.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={busy}
      aria-describedby={describedBy}
      className={`flex h-12 w-full shrink-0 items-center justify-center rounded-3xl font-sans text-[16px] font-semibold text-white transition-opacity disabled:opacity-45 ${
        tone === "buy" ? "bg-buy" : "bg-sell"
      }`}
    >
      {busy ? <ButtonSpinner /> : null}
      {label}
    </button>
  );
}
