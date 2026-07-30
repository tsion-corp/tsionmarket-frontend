"use client";

import { useTranslations } from "next-intl";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import {
  isValidAccount,
  isValidMobile,
  isValidName,
  type PayoutCountry,
  type PayoutMethodId,
  type MobileNetwork,
} from "@/lib/cross-border";

interface RecipientStepProps {
  country: PayoutCountry;
  method: PayoutMethodId;
  network: MobileNetwork | null;
  recipientName: string;
  accountNumber: string;
  bankName: string;
  onField: (field: "recipientName" | "accountNumber" | "bankName", value: string) => void;
  onBack: () => void;
  onNext: () => void;
}

// A labelled text field matching the sheet's input idiom.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

const INPUT_CLASS =
  "w-full rounded-[13px] border border-white/10 bg-black/35 px-3.5 py-3 font-sans text-[14.5px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-accent/45";

// Step 2: collect the recipient's identity. The fields depend on the payout
// rail chosen in step 1: a mobile wallet needs a phone number, a bank needs a
// bank name and account number. Continue stays disabled until the entry is a
// valid shape, so a malformed payout target never reaches review.
export function RecipientStep({
  country,
  method,
  network,
  recipientName,
  accountNumber,
  bankName,
  onField,
  onBack,
  onNext,
}: RecipientStepProps) {
  const t = useTranslations("remit");
  const isMobile = method === "mobile_money";
  const numberOk = isMobile ? isValidMobile(accountNumber) : isValidAccount(accountNumber);
  const bankOk = isMobile ? true : bankName.trim().length >= 2;
  const ready = isValidName(recipientName) && numberOk && bankOk;

  const subtitle = isMobile
    ? t("recipientSubtitleMobile", {
        network: network ? network.name : t("method_mobile_money"),
        country: country.name,
      })
    : t("recipientSubtitleBank", { country: country.name });

  return (
    <div>
      <SheetNav title={t("recipient")} subtitle={subtitle} onBack={onBack} />

      <div className="space-y-3.5">
        <Field label={t("recipientName")}>
          <input
            value={recipientName}
            onChange={(e) => onField("recipientName", e.target.value)}
            placeholder={t("recipientNamePlaceholder")}
            className={INPUT_CLASS}
          />
        </Field>

        {isMobile ? (
          <Field label={t("mobileNumber")}>
            <div className="flex items-stretch gap-2">
              <span className="flex shrink-0 items-center rounded-[13px] border border-white/10 bg-white/6 px-3 font-sans text-[14.5px] font-medium text-white/70">
                {country.dialCode}
              </span>
              <input
                inputMode="tel"
                value={accountNumber}
                onChange={(e) => onField("accountNumber", e.target.value)}
                placeholder="712 345 678"
                className={INPUT_CLASS}
              />
            </div>
          </Field>
        ) : (
          <>
            <Field label={t("bankName")}>
              <input
                value={bankName}
                onChange={(e) => onField("bankName", e.target.value)}
                placeholder={t("bankNamePlaceholder")}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label={t("accountNumber")}>
              <input
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => onField("accountNumber", e.target.value)}
                placeholder={t("accountNumber")}
                className={INPUT_CLASS}
              />
            </Field>
          </>
        )}
      </div>

      <p className="mt-3 text-[12px] leading-[1.5] font-normal text-white/45">
        {t("irreversibleWarning", { method: t(`method_${method}`) })}
      </p>

      <button
        onClick={onNext}
        disabled={!ready}
        className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("continue")}
      </button>
    </div>
  );
}
