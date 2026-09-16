"use client";

import { useTranslations } from "next-intl";
import {
  BALANCE_FRACTION_DIGITS,
  TradeAmountCard,
  type TradeAmountCardProps,
} from "@/components/ui/trade-amount-card";
import { formatDecimalString } from "@/lib/trade/amount";
import { fromBaseUnits } from "@/lib/trade/math";

// The spot desk's binding to the shared amount card. The card itself lives in
// components/ui because nothing about it is spot: it takes finished strings and
// reports what was typed. What is spot is the message namespace the strings are
// drawn from, and that is all this file supplies.
//
// The amount helpers moved to lib/trade/amount with the card, because the
// actions read the same verdict and the two must not be able to disagree. They
// are re-exported here under their old names so every existing caller, and
// every existing test, keeps the import it already has.

export type { AmountStatus as SpotAmountStatus } from "@/lib/trade/amount";
export {
  acceptsAmountInput,
  amountStatus as spotAmountStatus,
  formatDecimalString,
  fractionDigits,
} from "@/lib/trade/amount";

export type SpotAmountCardProps = Omit<TradeAmountCardProps, "labels">;

export function SpotAmountCard(props: SpotAmountCardProps) {
  const t = useTranslations("spot");

  // The balance line is an ICU message with two slots. Filling it is the
  // catalogue's job, so it happens here and the card receives one finished
  // string.
  const balance = t("balance", {
    amount: formatDecimalString(
      fromBaseUnits(props.balance, props.payDecimals),
      BALANCE_FRACTION_DIGITS
    ),
    symbol: props.paySymbol,
  });

  return (
    <TradeAmountCard
      {...props}
      labels={{
        paying: t("youArePaying"),
        selling: t("youAreSelling"),
        balance,
        amountLabel: t("amountLabel"),
        amountLabelSell: t("amountLabelSell"),
        changeToken: t("changeToken"),
      }}
    />
  );
}
