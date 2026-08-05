"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SheetNav } from "@/components/dashboard/funds/sheet-nav";
import { SearchIcon, CheckIcon } from "@/components/ui/icons";
import { usePayoutBanks, useVerifyRecipient } from "@/hooks/use-offramp";
import { normalizePhone } from "@/lib/payment/offramp";
import {
  isValidAccount,
  isValidMobile,
  isValidName,
  type PayoutCountry,
  type PayoutMethodId,
  type MobileNetwork,
} from "@/lib/cross-border";
import type { PayoutBank } from "@/lib/payment/offramp";

interface RecipientStepProps {
  country: PayoutCountry;
  method: PayoutMethodId;
  network: MobileNetwork | null;
  bank: PayoutBank | null;
  recipientName: string;
  accountNumber: string;
  recipientPhone: string;
  onBank: (bank: PayoutBank) => void;
  onField: (field: "recipientName" | "accountNumber" | "recipientPhone", value: string) => void;
  onVerified: (name: string | null) => void;
  onBack: () => void;
  onNext: () => void;
}

// A labelled text field matching the sheet's input idiom, with an inline
// error line that appears once the field has been touched and left invalid.
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-down mt-1.5 block text-[12px] leading-[1.4] font-normal">
          {error}
        </span>
      ) : null}
    </label>
  );
}

const INPUT_CLASS =
  "w-full rounded-[13px] border border-white/10 bg-black/35 px-3.5 py-3 font-sans text-[14.5px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-accent/45";
const INPUT_INVALID_CLASS =
  "w-full rounded-[13px] border border-down/50 bg-black/35 px-3.5 py-3 font-sans text-[14.5px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-down/70";

// The payout bank, picked from the rail's own list for the corridor — a payout
// is routed by the partner's bank code, so a free-typed name cannot be paid.
// Collapsed it shows the selection; expanded it is a searchable list.
function BankPicker({
  country,
  bank,
  onBank,
}: {
  country: PayoutCountry;
  bank: PayoutBank | null;
  onBank: (bank: PayoutBank) => void;
}) {
  const t = useTranslations("remit");
  const banks = usePayoutBanks(country.code);
  const [open, setOpen] = useState(bank === null);
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const list = banks.data ?? [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((b) => b.name.toLowerCase().includes(q)) : list;
  }, [banks.data, query]);

  if (!open && bank) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ws-inset flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/4"
      >
        <span className="min-w-0 truncate font-sans text-[14.5px] font-medium text-white">
          {bank.name}
        </span>
        <span className="text-accent shrink-0 text-[12.5px] font-medium">{t("change")}</span>
      </button>
    );
  }

  return (
    <div className="ws-inset overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/8 px-3.5 py-3">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("bankSearch")}
          className="w-full bg-transparent font-sans text-[14px] text-white outline-none placeholder:text-white/30"
        />
      </div>
      <div className="max-h-56 overflow-y-auto">
        {banks.isLoading ? (
          <div className="px-3.5 py-4 text-[13px] font-normal text-white/45">{t("loading")}</div>
        ) : banks.isError ? (
          <button
            type="button"
            onClick={() => void banks.refetch()}
            className="w-full cursor-pointer px-3.5 py-4 text-left text-[13px] font-normal text-white/55 underline underline-offset-2"
          >
            {t("banksFailed")}
          </button>
        ) : results.length === 0 ? (
          <div className="px-3.5 py-4 text-[13px] font-normal text-white/45">
            {t("noBanksMatch")}
          </div>
        ) : (
          results.map((b) => {
            const active = bank?.id === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  onBank(b);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/6"
              >
                <span className="min-w-0 truncate font-sans text-[13.5px] font-normal text-white/85">
                  {b.name}
                </span>
                {active ? <CheckIcon /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// Step 2: collect the payout target. The fields depend on the rail chosen in
// step 1: a mobile wallet is a phone number; a bank is a picked bank plus an
// account number, and the partner requires the recipient's mobile on every
// order regardless. Continue stays disabled until the entry is a valid shape,
// so a malformed payout target never reaches review.
export function RecipientStep({
  country,
  method,
  network,
  bank,
  recipientName,
  accountNumber,
  recipientPhone,
  onBank,
  onField,
  onVerified,
  onBack,
  onNext,
}: RecipientStepProps) {
  const t = useTranslations("remit");
  const verify = useVerifyRecipient();
  // Which fields the user has been in and left; errors only show for these,
  // so the form never opens covered in red.
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const touch = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  const isMobile = method === "mobile_money";
  const nameOk = isValidName(recipientName);
  const numberOk = isMobile ? isValidMobile(accountNumber) : isValidAccount(accountNumber);
  const phoneOk = isMobile || isValidMobile(recipientPhone);
  const bankOk = isMobile ? true : bank !== null;
  const ready = nameOk && numberOk && bankOk && phoneOk;

  const nameError = touched.recipientName && !nameOk ? t("invalidName") : null;
  const numberError =
    touched.accountNumber && !numberOk
      ? isMobile
        ? t("invalidMobile")
        : t("invalidAccount")
      : null;
  const phoneError = touched.recipientPhone && !phoneOk ? t("invalidMobile") : null;

  // Continue runs the rail's name enquiry first, so a wrong account or bank is
  // caught here — before any money moves. A failure blocks with the rail's own
  // reason but offers a way through, because the enquiry service itself can be
  // down while payouts still work.
  const onContinue = () => {
    if (!ready || verify.isPending) return;
    setVerifyError(null);
    verify.mutate(
      {
        transactionType: isMobile ? "wallet" : "bank",
        toCountry: country.code.toUpperCase(),
        receiveCurrency: country.currency,
        payeePhoneNumber: normalizePhone(
          isMobile ? accountNumber : recipientPhone,
          country.dialCode
        ),
        ...(isMobile
          ? {}
          : { receiverAccountNumber: accountNumber.trim(), bankCode: (bank as PayoutBank).id }),
      },
      {
        onSuccess: (result) => {
          onVerified(result.verified ? (result.accountName ?? null) : null);
          onNext();
        },
        onError: (error) => {
          onVerified(null);
          setVerifyError(error.message || t("verifyFailed"));
        },
      }
    );
  };

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
        <Field label={t("recipientName")} error={nameError}>
          <input
            value={recipientName}
            onChange={(e) => onField("recipientName", e.target.value)}
            onBlur={() => touch("recipientName")}
            placeholder={t("recipientNamePlaceholder")}
            className={nameError ? INPUT_INVALID_CLASS : INPUT_CLASS}
          />
        </Field>

        {isMobile ? (
          <Field label={t("mobileNumber")} error={numberError}>
            <div className="flex items-stretch gap-2">
              <span className="flex shrink-0 items-center rounded-[13px] border border-white/10 bg-white/6 px-3 font-sans text-[14.5px] font-medium text-white/70">
                {country.dialCode}
              </span>
              <input
                inputMode="tel"
                value={accountNumber}
                onChange={(e) => onField("accountNumber", e.target.value)}
                onBlur={() => touch("accountNumber")}
                placeholder="712 345 678"
                className={numberError ? INPUT_INVALID_CLASS : INPUT_CLASS}
              />
            </div>
          </Field>
        ) : (
          <>
            <Field label={t("bankName")}>
              <BankPicker country={country} bank={bank} onBank={onBank} />
            </Field>
            <Field label={t("accountNumber")} error={numberError}>
              <input
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => onField("accountNumber", e.target.value)}
                onBlur={() => touch("accountNumber")}
                placeholder={t("accountNumber")}
                className={numberError ? INPUT_INVALID_CLASS : INPUT_CLASS}
              />
            </Field>
            <Field label={t("recipientMobile")} error={phoneError}>
              <div className="flex items-stretch gap-2">
                <span className="flex shrink-0 items-center rounded-[13px] border border-white/10 bg-white/6 px-3 font-sans text-[14.5px] font-medium text-white/70">
                  {country.dialCode}
                </span>
                <input
                  inputMode="tel"
                  value={recipientPhone}
                  onChange={(e) => onField("recipientPhone", e.target.value)}
                  onBlur={() => touch("recipientPhone")}
                  placeholder="712 345 678"
                  className={phoneError ? INPUT_INVALID_CLASS : INPUT_CLASS}
                />
              </div>
            </Field>
          </>
        )}
      </div>

      <p className="mt-3 text-[12px] leading-[1.5] font-normal text-white/45">
        {t("irreversibleWarning", { method: t(`method_${method}`) })}
      </p>

      {verifyError ? (
        <div className="border-down/30 bg-down/8 mt-3 rounded-[12px] border px-3.5 py-3">
          <div className="text-[12.5px] leading-[1.5] font-normal text-white/80">{verifyError}</div>
          <button
            type="button"
            onClick={() => {
              onVerified(null);
              onNext();
            }}
            className="mt-1.5 cursor-pointer text-[12.5px] font-medium text-white/60 underline underline-offset-2 hover:text-white/85"
          >
            {t("continueAnyway")}
          </button>
        </div>
      ) : null}

      <button
        onClick={onContinue}
        disabled={!ready || verify.isPending}
        className="text-ink mt-4 w-full cursor-pointer rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {verify.isPending ? t("verifying") : t("continue")}
      </button>
    </div>
  );
}
