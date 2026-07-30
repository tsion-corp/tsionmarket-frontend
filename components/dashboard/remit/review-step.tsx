"use client";

import { useTranslations } from "next-intl";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { ComingSoon } from "@/components/dashboard/funds/coming-soon";
import { FlagIcon } from "@/components/ui/flag-icon";
import { useFx } from "@/hooks/use-fx";
import { formatAmount } from "@/lib/trade/math";
import { feeUsd, maskNumber, recipientReceives, totalDebitUsd } from "@/lib/cross-border";
import type { RemitForm } from "@/components/dashboard/remit/remit-types";

interface ReviewStepProps {
  form: RemitForm;
  onBack: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-[13px] font-normal text-white/50">{label}</span>
      <span className="text-right font-sans text-[13.5px] font-medium text-white">{value}</span>
    </div>
  );
}

// Step 4: the final summary. Everything the user entered is shown back for a
// last check. The send button is intentionally gated: the payout rail is not yet
// connected to a provider, so we present the real flow and are honest that the
// send itself is coming, exactly as the bank off-ramp does.
export function ReviewStep({ form, onBack }: ReviewStepProps) {
  const t = useTranslations("remit");
  const { rate } = useFx();
  const { country, method, network, recipientName, accountNumber, bankName, amountUsd } = form;

  // The review is only reachable once these are set, but guard for type safety.
  if (!country || !method) return null;

  const amount = Number(amountUsd);
  const localRate = rate(country.currency);
  const receives = recipientReceives(amount, country, localRate);
  const destinationLabel =
    method === "mobile_money"
      ? `${network ? network.name : t("method_mobile_money")} ${maskNumber(accountNumber)}`
      : `${bankName} ${maskNumber(accountNumber)}`;

  return (
    <div>
      <SheetNav title={t("reviewPayment")} subtitle={t("reviewSubtitle")} onBack={onBack} />

      <div className="ws-inset px-[15px] py-1.5">
        <Row label={t("recipient")} value={recipientName} />
        <div className="border-t border-white/6" />
        <Row
          label={t("destination")}
          value={
            <span className="flex items-center justify-end gap-2">
              <FlagIcon code={country.currency} symbol={country.currency} size={18} />
              {country.name}
            </span>
          }
        />
        <div className="border-t border-white/6" />
        <Row label={t(`method_${method}`)} value={destinationLabel} />
        <div className="border-t border-white/6" />
        <Row
          label={t("theyReceive")}
          value={<span className="text-accent">{receives ?? "—"}</span>}
        />
        <div className="border-t border-white/6" />
        <Row label={t("fee")} value={`$${formatAmount(feeUsd(amount))}`} />
        <div className="border-t border-white/6" />
        <Row
          label={t("youPay")}
          value={
            <span className="text-[15px] font-semibold">
              ${formatAmount(totalDebitUsd(amount))}
            </span>
          }
        />
      </div>

      <ComingSoon title={t("payoutsAlmostReady")}>
        {t("payoutsAlmostReadyBody", { country: country.name })}
      </ComingSoon>

      <button
        disabled
        className="text-ink mt-4 w-full cursor-not-allowed rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold opacity-50"
      >
        {t("sendPayment")}
      </button>
    </div>
  );
}
