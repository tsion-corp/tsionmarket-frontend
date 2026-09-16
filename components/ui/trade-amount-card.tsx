"use client";

import type { ReactNode } from "react";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { acceptsAmountInput, amountStatus } from "@/lib/trade/amount";
import { tokenBg } from "@/lib/trade/assets";

// The pay leg of a 2.0 trade ticket: how much, out of what balance, in which
// token. Presentational only. The amount is a decimal string owned by the page;
// the balance arrives already in base units.
//
// It lives here rather than under features/trade because nothing in it knows
// what a spot market is. Every word it prints arrives through `labels`, so a
// desk binds its own message namespace on the way in and this file never reads
// a catalogue.
//
// Money rules this file follows, and the reason for each:
//
//   * An amount is a decimal string ("12.345678"), never a number. Parsing it
//     to a float and printing it back loses digits at 17 significant figures,
//     which is inside the range a USDC balance reaches.
//   * The balance arrives as bigint base units, so nothing here has to parse a
//     balance at all. Comparing the amount to it converts the amount to base
//     units and compares two bigints.
//   * Formatting for display works on the digits of the string: group the
//     whole part, cut the fraction. No arithmetic, so nothing to round.

// How much of the fraction the balance line shows. Six digits covers USDC in
// full and keeps an 18-decimal token from running off the header. It is
// exported because the caller formats the balance figure: this card takes the
// finished line, so the digit count has to be agreed in one place.
export const BALANCE_FRACTION_DIGITS = 6;

// Every string the card prints. The balance line arrives finished rather than
// as a figure plus a pattern, because interpolating a message is the message
// catalogue's job and this component has no catalogue.
export interface TradeAmountCardLabels {
  // Heading over the buy leg, e.g. "You are paying".
  paying: string;
  // Heading over the sell leg, e.g. "You are selling".
  selling: string;
  // The whole balance line, already interpolated, e.g. "Balance 1,240 USDC".
  balance: string;
  // Accessible name of the input on the buy leg.
  amountLabel: string;
  // Accessible name of the input on the sell leg.
  amountLabelSell: string;
  // Accessible name of the token pill when it is a picker.
  changeToken: string;
}

export interface TradeAmountCardProps {
  // The entered amount as a decimal string, "" when the field is empty.
  amount: string;
  // Called only with a value the field accepts. A rejected keystroke does not
  // fire it, so the parent's state stays on the last good value.
  onAmountChange: (next: string) => void;
  // The spendable balance of the asset the amount is denominated in, in that
  // asset's own base units. On the sell side that is the asset being sold, not
  // the pay token, or the field would be marked against the wrong balance while
  // the actions gate Sell against the right one.
  balance: bigint;
  payDecimals: number;
  paySymbol: string;
  payLogo?: string | null;
  // Omit to render the token as a static pill instead of a picker.
  onSelectPayToken?: () => void;
  // Which leg is being entered. It changes only the heading: the asset, its
  // decimals and its balance are already chosen by the caller. Defaults to the
  // buy leg so existing callers read exactly as before.
  side?: "buy" | "sell";
  // Rendered inside the card, under the input. The sell leg puts its share
  // shortcuts here so they sit within the field's own border, the way the meme
  // desk draws them, rather than floating below it as a separate control.
  footer?: ReactNode;
  // Set while an order is in flight, so the amount cannot move under a signature.
  disabled?: boolean;
  labels: TradeAmountCardLabels;
}

export function TradeAmountCard({
  amount,
  onAmountChange,
  balance,
  payDecimals,
  paySymbol,
  payLogo,
  onSelectPayToken,
  side = "buy",
  footer,
  disabled = false,
  labels,
}: TradeAmountCardProps) {
  const status = amountStatus(amount, balance, payDecimals);
  const invalid = status === "above-balance" || status === "invalid" || status === "too-precise";

  // The invalid edge is the same rose the ws-invalid utility paints on field
  // containers elsewhere, so a bad amount reads the same across the app.
  return (
    <div
      className={`rounded-card bg-surface flex w-full flex-col gap-3 border-2 p-4 ${
        invalid ? "border-down/55" : "border-hairline"
      }`}
    >
      <div className="flex items-center justify-between gap-3 whitespace-nowrap">
        <span className="ws-display text-[13px] font-semibold tracking-[-0.39px] text-[rgba(148,163,184,0.5)]">
          {side === "buy" ? labels.paying : labels.selling}
        </span>
        <span className="ws-display text-[12px] font-semibold tracking-[-0.24px] text-[rgba(179,186,196,0.6)]">
          {labels.balance}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={amount}
          disabled={disabled}
          aria-label={side === "buy" ? labels.amountLabel : labels.amountLabelSell}
          aria-invalid={invalid}
          placeholder="0"
          onChange={(event) => {
            const next = event.target.value;
            if (next === amount) return;
            if (!acceptsAmountInput(next, payDecimals)) return;
            onAmountChange(next);
          }}
          className="ws-display min-w-0 flex-1 bg-transparent text-[28px] font-bold text-[#f8fafc] outline-none disabled:opacity-60"
        />
        <TokenPill
          symbol={paySymbol}
          logo={payLogo}
          label={labels.changeToken}
          onSelect={onSelectPayToken}
          disabled={disabled}
        />
      </div>

      {footer}
    </div>
  );
}

function TokenPill({
  symbol,
  logo,
  label,
  onSelect,
  disabled,
}: {
  symbol: string;
  logo?: string | null;
  label: string;
  onSelect?: () => void;
  disabled: boolean;
}) {
  const body = (
    <>
      <AssetIcon sym={symbol} bg={tokenBg(symbol)} size={16} logo={logo} />
      <span className="ws-display text-[13px] font-semibold tracking-[-0.39px] text-[#f8fafc]">
        {symbol}
      </span>
      {onSelect ? (
        <ChevronLeftIcon size={8} className="shrink-0 -rotate-90 text-[#f8fafc]" />
      ) : null}
    </>
  );
  const shell = "flex shrink-0 items-center gap-1.5 rounded-full bg-grey-800 px-2.5 py-1.5";

  if (!onSelect) return <span className={shell}>{body}</span>;

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-label={label}
      className={`${shell} hover:bg-grey-700 transition-colors disabled:opacity-60`}
    >
      {body}
    </button>
  );
}
