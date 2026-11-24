"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, SearchIcon } from "@/components/ui/icons";
import { MASK_ATTRIBUTE } from "@/lib/analytics/clarity";
import { friendlyError } from "@/lib/errors";
import { usePaycrestInstitutions, useVerifyPaycrestAccount } from "@/hooks/use-paycrest";
import type { PaycrestInstitution } from "@/lib/paycrest/types";

export interface ResolvedAccount {
  institution: string;
  institutionName: string;
  accountIdentifier: string;
  accountName: string;
}

const ACCOUNT_DIGITS = 10; // NUBAN, the only account format the UI takes today

const BOX =
  "focus-within:border-accent/45 flex items-center gap-2.5 rounded-2xl border border-white/15 bg-[#1b1b1b] px-4 py-3.5 transition-colors";
const INPUT =
  "w-full bg-transparent font-sans text-[14px] text-white outline-none placeholder:text-white/40";

// Bank + account number, verified against Paycrest as soon as the number is
// complete. Reports a fully resolved account (or null) to the parent. When the
// corridor confirms the account without a name, the user types it.
export function PaycrestAccountField({
  currency,
  onChange,
  disabled,
}: {
  currency: string;
  onChange: (account: ResolvedAccount | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("paycrest");
  const institutions = usePaycrestInstitutions(currency);
  const verify = useVerifyPaycrestAccount();
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [bank, setBank] = useState<PaycrestInstitution | null>(null);
  const [account, setAccount] = useState("");
  const [manualName, setManualName] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (institutions.data ?? []).filter((i) => i.type === "bank");
    return (q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list).slice(0, 40);
  }, [query, institutions.data]);

  const verified = verify.isSuccess && verify.variables?.accountIdentifier === account;
  const resolvedName = verified ? (verify.data.accountName ?? manualName.trim()) : "";
  const needsManualName = verified && verify.data.accountName === null;

  const bankCode = bank?.code ?? null;
  const bankName = bank?.name ?? "";
  useEffect(() => {
    onChange(
      bankCode && verified && resolvedName.length >= 2
        ? {
            institution: bankCode,
            institutionName: bankName,
            accountIdentifier: account,
            accountName: resolvedName,
          }
        : null
    );
    // Callers pass a state setter, which is stable, so this runs only when the
    // account itself changes.
  }, [onChange, bankCode, bankName, account, verified, resolvedName]);

  const pick = (next: PaycrestInstitution) => {
    setBank(next);
    setPicking(false);
    setQuery("");
    setAccount("");
    setManualName("");
    verify.reset();
  };

  const onAccount = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, ACCOUNT_DIGITS);
    setAccount(next);
    setManualName("");
    verify.reset();
    if (bank && next.length === ACCOUNT_DIGITS) {
      verify.mutate({ institution: bank.code, accountIdentifier: next });
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setPicking((open) => !open)}
        className="flex w-full cursor-pointer items-center justify-between rounded-2xl border border-white/15 bg-[#1b1b1b] px-4 py-3.5 text-left font-sans text-[14px] text-white transition-colors hover:bg-white/6 disabled:opacity-60"
      >
        <span className={bank ? "text-white" : "text-white/40"}>
          {bank?.name ?? t("selectBank")}
        </span>
        <span className="text-accent text-[12.5px] font-medium">{bank ? t("change") : ""}</span>
      </button>

      {picking ? (
        <div className="rounded-2xl border border-white/15 bg-[#151515] p-2">
          <label className={BOX}>
            <SearchIcon size={16} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchBank")}
              className={INPUT}
            />
          </label>
          {institutions.isPending ? (
            <div className="mt-2 flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          ) : institutions.isError ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[13px] text-white/55">{t("banksFailed")}</p>
              <button
                type="button"
                onClick={() => institutions.refetch()}
                className="mt-2 cursor-pointer rounded-[12px] border border-white/15 bg-white/8 px-4 py-2 text-[13px] font-medium text-white hover:bg-white/12"
              >
                {t("retry")}
              </button>
            </div>
          ) : (
            <ul className="mt-2 max-h-[240px] overflow-y-auto">
              {results.map((i) => (
                <li key={i.code}>
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    className="w-full cursor-pointer rounded-xl px-3 py-2.5 text-left text-[13.5px] text-white/85 hover:bg-white/6"
                  >
                    {i.name}
                  </button>
                </li>
              ))}
              {results.length === 0 ? (
                <li className="px-3 py-4 text-center text-[13px] text-white/45">
                  {t("noBankMatch")}
                </li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}

      <div>
        <div className={BOX}>
          <input
            {...MASK_ATTRIBUTE}
            inputMode="numeric"
            value={account}
            disabled={disabled || !bank}
            onChange={(e) => onAccount(e.target.value)}
            placeholder={t("accountNumber")}
            aria-label={t("accountNumber")}
            className={`tnum ${INPUT}`}
          />
          {verify.isPending ? (
            <span
              role="status"
              aria-label={t("verifying")}
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white/70"
            />
          ) : verified ? (
            <CheckIcon size={16} className="text-accent shrink-0" />
          ) : null}
        </div>
        {verified && verify.data.accountName ? (
          <div className="mt-1.5 text-[13px] font-medium text-white">{verify.data.accountName}</div>
        ) : verify.isError ? (
          <p className="text-down mt-1.5 text-[12.5px]">
            {friendlyError(verify.error, t("verifyFailed"))}
          </p>
        ) : null}
      </div>

      {needsManualName ? (
        <label className={BOX}>
          <input
            {...MASK_ATTRIBUTE}
            value={manualName}
            disabled={disabled}
            onChange={(e) => setManualName(e.target.value)}
            placeholder={t("accountName")}
            aria-label={t("accountName")}
            className={INPUT}
          />
        </label>
      ) : null}
    </div>
  );
}
