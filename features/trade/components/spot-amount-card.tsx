"use client";

import { useTranslations } from "next-intl";
import { AssetIcon } from "@/components/ui/asset-icon";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { tokenBg } from "@/lib/trade/assets";
import { fromBaseUnits, toBaseUnits } from "@/lib/trade/math";

// The pay leg of the 2.0 desktop spot ticket: how much, out of what balance,
// in which token. Presentational only. The amount is a decimal string owned by
// the page; the balance arrives already in base units.
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

// Digits with at most one decimal point. A leading point is allowed so a
// fraction can be typed from the left ("." then ".5"); toBaseUnits reads it.
const DECIMAL_INPUT = /^\d*\.?\d*$/;

// A long enough entry is a paste of something that is not an amount. Cap it so
// a runaway string never reaches BigInt().
const MAX_AMOUNT_LENGTH = 32;

// How much of the fraction the balance line shows. Six digits covers USDC in
// full and keeps an 18-decimal token from running off the header.
const BALANCE_FRACTION_DIGITS = 6;

export type SpotAmountStatus = "empty" | "invalid" | "too-precise" | "above-balance" | "ok";

// Fraction digits in a decimal string, counted rather than parsed.
export function fractionDigits(value: string): number {
  const dot = value.indexOf(".");
  return dot === -1 ? 0 : value.length - dot - 1;
}

// Whether a keystroke may land in the amount field. Anything else is dropped,
// so the field never shows a value the ticket cannot execute.
export function acceptsAmountInput(next: string, decimals: number): boolean {
  if (next.length > MAX_AMOUNT_LENGTH) return false;
  if (!DECIMAL_INPUT.test(next)) return false;
  return fractionDigits(next) <= decimals;
}

// The single verdict on an entered amount. Both the card (which marks the
// field) and the actions (which disable and explain) read it, so they cannot
// disagree about whether an amount is spendable.
export function spotAmountStatus(
  amount: string,
  balanceBaseUnits: bigint,
  decimals: number
): SpotAmountStatus {
  const trimmed = amount.trim();
  if (!trimmed || trimmed === ".") return "empty";
  if (trimmed.length > MAX_AMOUNT_LENGTH || !DECIMAL_INPUT.test(trimmed)) return "invalid";
  // Truncating the extra digits instead would let 1240.0000001 read as exactly
  // a 1240 balance and pass the balance check.
  if (fractionDigits(trimmed) > decimals) return "too-precise";
  const entered = toBaseUnits(trimmed, decimals);
  if (entered === 0n) return "empty";
  if (entered > balanceBaseUnits) return "above-balance";
  return "ok";
}

// Group the whole part of a decimal string in threes and cut the fraction to
// `maxFractionDigits`. The cut truncates rather than rounds: a rounded-up
// balance would offer to spend money that is not there.
export function formatDecimalString(value: string, maxFractionDigits: number): string {
  const [whole = "0", frac = ""] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const kept = frac.slice(0, maxFractionDigits).replace(/0+$/, "");
  return kept ? `${grouped}.${kept}` : grouped;
}

export interface SpotAmountCardProps {
  // The entered amount as a decimal string, "" when the field is empty.
  amount: string;
  // Called only with a value the field accepts. A rejected keystroke does not
  // fire it, so the parent's state stays on the last good value.
  onAmountChange: (next: string) => void;
  // The spendable balance of the asset the amount is denominated in, in that
  // asset's own base units. On the sell side that is the asset being sold, not
  // the pay token, or the field would be marked against the wrong balance while
  // SpotTradeActions gates Sell against the right one.
  balance: bigint;
  payDecimals: number;
  paySymbol: string;
  payLogo?: string | null;
  // Omit to render the token as a static pill instead of a picker.
  onSelectPayToken?: () => void;
  // Set while an order is in flight, so the amount cannot move under a signature.
  disabled?: boolean;
}

export function SpotAmountCard({
  amount,
  onAmountChange,
  balance,
  payDecimals,
  paySymbol,
  payLogo,
  onSelectPayToken,
  disabled = false,
}: SpotAmountCardProps) {
  const t = useTranslations("spot");
  const status = spotAmountStatus(amount, balance, payDecimals);
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
          {t("youArePaying")}
        </span>
        <span className="ws-display text-[12px] font-semibold tracking-[-0.24px] text-[rgba(179,186,196,0.6)]">
          {t("balance", {
            amount: formatDecimalString(
              fromBaseUnits(balance, payDecimals),
              BALANCE_FRACTION_DIGITS
            ),
            symbol: paySymbol,
          })}
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
          aria-label={t("amountLabel")}
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
          label={t("changeToken")}
          onSelect={onSelectPayToken}
          disabled={disabled}
        />
      </div>
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
