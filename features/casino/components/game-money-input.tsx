"use client";

import { useState, type ComponentProps } from "react";
import { useMoney } from "@/components/ui/currency-select";

interface GameMoneyInputProps extends Omit<
  ComponentProps<"input">,
  "value" | "onChange" | "onBlur"
> {
  value: string;
  currencyDecimals: number;
  onValueChange: (value: string) => void;
}

function canonicalAmount(value: number, decimals: number): string {
  return value
    .toFixed(decimals)
    .replace(/\.0+$/u, "")
    .replace(/(\.\d*?)0+$/u, "$1");
}

export function GameMoneyInput({
  value,
  currencyDecimals,
  onValueChange,
  onKeyDown,
  ...props
}: GameMoneyInputProps) {
  const money = useMoney();
  const currencyKey = money.ready ? money.currency.code : "USD";
  const [draft, setDraft] = useState<{
    canonical: string;
    currency: string;
    text: string;
  } | null>(null);
  const activeDraft =
    draft?.canonical === value && draft.currency === currencyKey ? draft.text : null;
  const shownValue =
    activeDraft ??
    (!money.ready || money.currency.code === "USD" ? value : money.toInput(Number(value)));

  return (
    <input
      {...props}
      value={shownValue}
      onChange={(event) => {
        const next = event.target.value;
        if (!next.trim()) {
          setDraft({ canonical: "", currency: currencyKey, text: next });
          onValueChange("");
          return;
        }

        const canonical = money.fromInput(next);
        if (canonical === null) {
          setDraft({ canonical: value, currency: currencyKey, text: next });
          return;
        }
        const normalized = canonicalAmount(canonical, currencyDecimals);
        setDraft({ canonical: normalized, currency: currencyKey, text: next });
        onValueChange(normalized);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}
