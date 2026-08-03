"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { KycField } from "@/components/dashboard/funds/kyc/kyc-field";
import { useKycSubmit } from "@/hooks/use-pouch-kyc";
import { friendlyError } from "@/lib/errors";
import {
  buildKycDocuments,
  isFormSubmittable,
  validateKycValue,
  type KycField as KycFieldType,
  type KycFieldError,
  type KycState,
} from "@/lib/pouch/kyc";

interface KycFormProps {
  token: string;
  countryCode: string;
  fields: KycFieldType[];
  // Known values to seed matching fields, for example the verified email.
  prefill?: Record<string, string>;
  onSubmitted: (state: KycState, message: string) => void;
}

// The dynamic KYC form. It renders whatever fields Pouch asked for and submits
// the assembled documents map. No field is hardcoded, so a change to a country's
// requirements flows through without a code change.
export function KycForm({ token, countryCode, fields, prefill, onSubmitted }: KycFormProps) {
  const t = useTranslations("fundsKyc");
  const submit = useKycSubmit();

  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);

  const seeded = useMemo(() => {
    if (!prefill) return {};
    const seed: Record<string, string> = {};
    for (const field of fields) {
      const known = prefill[field.key];
      if (known) seed[field.key] = known;
    }
    return seed;
  }, [prefill, fields]);

  const effective = useMemo(() => ({ ...seeded, ...values }), [seeded, values]);
  const ready = isFormSubmittable(fields, effective);

  const errorMessage = (code: KycFieldError): string | null => {
    switch (code) {
      case "required":
        return t("errRequired");
      case "invalidEmail":
        return t("errEmail");
      case "invalidPhone":
        return t("errPhone");
      case "invalidDate":
        return t("errDate");
      case "invalidNumber":
        return t("errNumber");
      default:
        return null;
    }
  };

  const handleSubmit = async () => {
    setAttempted(true);
    if (!ready) return;
    try {
      const documents = buildKycDocuments(fields, effective);
      const result = await submit.mutateAsync({ token, countryCode, documents });
      onSubmitted(result.state, result.message);
    } catch {
      // Surfaced below via submit.error.
    }
  };

  return (
    <div>
      <div className="ws-display text-[22px] tracking-[-0.01em]">{t("detailsTitle")}</div>
      <p className="mt-1.5 text-[13.5px] leading-normal font-normal text-white/60">
        {t("detailsSubtitle")}
      </p>

      <div className="mt-4 space-y-3.5">
        {fields.map((field) => {
          const raw = effective[field.key] ?? "";
          const show = attempted || touched[field.key];
          const error = show ? errorMessage(validateKycValue(field, raw)) : null;
          return (
            <div key={field.key} onBlur={() => setTouched((s) => ({ ...s, [field.key]: true }))}>
              <KycField
                field={field}
                value={raw}
                error={error}
                onChange={(value) => setValues((v) => ({ ...v, [field.key]: value }))}
                disabled={submit.isPending}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[12px] leading-[1.5] font-normal text-white/45">{t("privacyNote")}</p>

      {submit.isError ? (
        <p className="text-down mt-3 text-[13px]">
          {friendlyError(submit.error, t("submitFailed"))}
        </p>
      ) : null}

      <button
        onClick={handleSubmit}
        disabled={submit.isPending || (attempted && !ready)}
        className="text-ink mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-white p-3.5 font-sans text-[15px] font-semibold hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submit.isPending ? (
          <>
            <span className="border-ink/30 border-t-ink h-4 w-4 animate-spin rounded-full border-2" />
            {t("submitting")}
          </>
        ) : (
          t("submitDetails")
        )}
      </button>
    </div>
  );
}
