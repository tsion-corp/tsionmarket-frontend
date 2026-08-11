"use client";

import { useTranslations } from "next-intl";
import { SheetNav } from "@/components/ui/sheet-nav";
import { useFx } from "@/hooks/use-fx";
import { usePortfolio } from "@/hooks/use-portfolio";
import { formatAmount } from "@/lib/trade/math";
import {
  feeUsd,
  recipientReceives,
  totalDebitUsd,
  type PayoutCountry,
} from "@/features/remit/lib/cross-border";

interface AmountStepProps {
  country: PayoutCountry;
  amountUsd: string;
  onAmount: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
}

const DECIMAL_INPUT = /^\d*\.?\d*$/;

// A single summary line in the conversion breakdown.
function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] font-normal text-white/55">{label}</span>
      <span
        className={
          strong
            ? "tnum font-sans text-[14px] font-semibold text-white"
            : "tnum text-[13.5px] font-normal text-white/80"
        }
      >
        {value}
      </span>
    </div>
  );
}

// Step 3: enter the USD send amount. The recipient figure and fee update live so
// the user sees exactly what lands in the local currency before reviewing. The
// balance comes from the portfolio total; the fee is a display estimate until
// the payout provider returns a real quote.
export function AmountStep({ country, amountUsd, onAmount, onBack, onNext }: AmountStepProps) {
  const t = useTranslations("remit");
  const { totalUsd } = usePortfolio();
  const { rate } = useFx();
  const localRate = rate(country.currency);

  const amount = Number(amountUsd);
  const valid = Number.isFinite(amount) && amount > 0;
  const debit = totalDebitUsd(amount);
  const over = debit > totalUsd;
  const receives = recipientReceives(amount, country, localRate);
  const ready = valid && !over;

  return (
    <div>
      <SheetNav
        title={t("amount")}
        subtitle={t("amountSubtitle", { country: country.name })}
        onBack={onBack}
      />

      <div className="ws-inset p-[15px]">
        <div className="mb-[9px] flex justify-between text-xs font-normal text-white/55">
          <span>{t("youSend")}</span>
          <button
            onClick={() => onAmount(String(Math.max(0, Math.floor(totalUsd * 100) / 100)))}
            className="cursor-pointer text-white/55 hover:text-white"
          >
            {t("balance", { amount: `$${formatAmount(totalUsd)}` })}
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <input
            inputMode="decimal"
            value={amountUsd}
            onChange={(e) => {
              const next = e.target.value;
              if (next === "" || DECIMAL_INPUT.test(next)) onAmount(next);
            }}
            placeholder="0.00"
            className="ws-display tnum w-full border-none bg-transparent text-[28px] text-white outline-none placeholder:text-white/30"
          />
          <span className="font-sans text-[15px] font-medium text-white/70">USD</span>
        </div>
        {over ? (
          <div className="text-down mt-2 text-[12px] font-normal">{t("overBalance")}</div>
        ) : null}
      </div>

      <div className="ws-inset mt-3 space-y-2.5 p-[15px]">
        <Line
          label={t("recipientGets", { currency: country.currency })}
          value={receives ?? "—"}
          strong
        />
        <Line label={t("fee")} value={valid ? `$${formatAmount(feeUsd(amount))}` : "—"} />
        <div className="border-t border-white/8 pt-2.5">
          <Line label={t("totalToPay")} value={valid ? `$${formatAmount(debit)}` : "—"} strong />
        </div>
      </div>

      {localRate == null ? (
        <p className="mt-3 text-[12px] font-normal text-white/45">
          {t("fetchingRate", { currency: country.currency })}
        </p>
      ) : null}

      <button
        onClick={onNext}
        disabled={!ready}
        className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("reviewPayment")}
      </button>
    </div>
  );
}
