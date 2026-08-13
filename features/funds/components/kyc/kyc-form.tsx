"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { KycField } from "@/features/funds/components/kyc/kyc-field";
import { useKycSubmit } from "@/features/funds/hooks/use-pouch-kyc";
import { friendlyError } from "@/lib/errors";
import { MASK_ATTRIBUTE, tagClaritySession } from "@/lib/analytics/clarity";
import { setSuper, track } from "@/lib/analytics/mixpanel";
import {
  buildKycDocuments,
  isFormSubmittable,
  isNameMismatchMessage,
  validateKycValue,
  type KycField as KycFieldType,
  type KycFieldError,
  type KycState,
} from "@/features/funds/lib/kyc";

interface KycFormProps {
  token: string;
  countryCode: string;
  fields: KycFieldType[];
  // Known values to seed matching fields, for example the verified email.
  prefill?: Record<string, string>;
  onSubmitted: (state: KycState, message: string) => void;
  // Starts a fresh pass (email OTP, then this form again). Offered when the
  // provider reports the name not matching the identity records.
  onRevalidate?: () => void;
}

// Which identity document a submission used, read from the field keys alone.
// Returns null when it is neither, so an unrecognised form reports no type
// rather than guessing one.
function documentKind(keys: string[]): "nin" | "bvn" | null {
  const upper = keys.map((key) => key.toUpperCase());
  if (upper.some((key) => key.includes("NIN"))) return "nin";
  if (upper.some((key) => key.includes("BVN"))) return "bvn";
  return null;
}

// The dynamic KYC form. It renders whatever fields Pouch asked for and submits
// the assembled documents map. No field is hardcoded, so a change to a country's
// requirements flows through without a code change.
export function KycForm({
  token,
  countryCode,
  fields,
  prefill,
  onSubmitted,
  onRevalidate,
}: KycFormProps) {
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
      case "invalid11Digits":
        return t("errDigits11");
      default:
        return null;
    }
  };

  const handleSubmit = async () => {
    setAttempted(true);
    if (!ready) return;
    try {
      const documents = buildKycDocuments(fields, effective);
      // Which kind of document was used, derived from the field keys. The
      // value behind it never leaves this function: a NIN or BVN is NDPR
      // crown-jewel data and must never reach an analytics property.
      const kycType = documentKind(Object.keys(documents));
      if (kycType) track("kyc_started", { kyc_type: kycType });

      const result = await submit.mutateAsync({ token, countryCode, documents });

      // "approved" is the only outcome that is a pass. Pending is still in
      // review, so it is neither completed nor failed yet.
      if (result.state === "approved") {
        track("kyc_completed");
        // Later events carry the new status, so a funnel can be split by it.
        setSuper({ kyc_status: "verified" });
        void tagClaritySession({ kyc_status: "verified" });
      } else if (result.state === "pending") {
        setSuper({ kyc_status: "pending" });
        void tagClaritySession({ kyc_status: "pending" });
      } else if (result.state === "rejected") {
        track("kyc_failed", { reason: "rejected" });
      }
      onSubmitted(result.state, result.message);
    } catch {
      // A coded reason, never the provider's raw text: that can quote back the
      // value the user typed.
      track("kyc_failed", { reason: "submit_error" });
      // Surfaced below via submit.error.
    }
  };

  return (
    <div>
      <div className="ws-display text-[22px] tracking-[-0.01em]">{t("detailsTitle")}</div>
      <p className="mt-1.5 text-[13.5px] leading-normal font-normal text-white/60">
        {t("detailsSubtitle")}
      </p>

      {/* Masked as a whole rather than field by field: everything inside is
          identity-document data (NIN, BVN, date of birth), a session replay of
          it would be the same breach as sending it, and masking the container
          covers any field added here later. */}
      <div className="mt-4 space-y-3.5" {...MASK_ATTRIBUTE}>
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
        <div className="mt-3">
          <p className="text-down text-[13px]">{friendlyError(submit.error, t("submitFailed"))}</p>
          {onRevalidate && isNameMismatchMessage(submit.error?.message) ? (
            <>
              <p className="mt-1.5 text-[12.5px] leading-normal font-normal text-white/55">
                {t("nameMismatchHint")}
              </p>
              <button
                onClick={onRevalidate}
                className="mt-2.5 w-full cursor-pointer rounded-[13px] border border-white/14 bg-white/6 p-3 font-sans text-[14px] font-medium text-white hover:bg-white/10"
              >
                {t("revalidate")}
              </button>
            </>
          ) : null}
        </div>
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
