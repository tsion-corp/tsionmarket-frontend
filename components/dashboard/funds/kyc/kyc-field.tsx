"use client";

import { useTranslations } from "next-intl";
import type { KycField as KycFieldType } from "@/lib/pouch/kyc";

interface KycFieldProps {
  field: KycFieldType;
  value: string;
  // A localized error message, or null when the value is acceptable.
  error: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const INPUT_CLASS =
  "w-full rounded-[13px] border border-white/10 bg-black/35 px-3.5 py-3 font-sans text-[14.5px] text-white outline-none transition-colors placeholder:text-white/30 focus:border-accent/45 disabled:opacity-60";

// Render a single KYC requirement. The control is chosen from the field's
// inferred kind; the label and required flag come from Pouch. Presentational:
// validation happens in the parent, which passes a ready error message down.
export function KycField({ field, value, error, onChange, disabled }: KycFieldProps) {
  const t = useTranslations("fundsKyc");

  const inputType =
    field.kind === "date"
      ? "date"
      : field.kind === "email"
        ? "email"
        : field.kind === "tel"
          ? "tel"
          : "text";
  const inputMode = field.kind === "number" ? "numeric" : field.kind === "tel" ? "tel" : undefined;

  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1 text-[12px] font-medium tracking-[0.02em] text-white/45 uppercase">
        {field.label}
        {field.required ? <span className="text-accent">*</span> : null}
      </span>
      <input
        type={inputType}
        inputMode={inputMode}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          field.kind === "date" ? undefined : t("fieldPlaceholder", { label: field.label })
        }
        className={INPUT_CLASS}
      />
      {error ? <span className="text-down mt-1.5 block text-[12px]">{error}</span> : null}
    </label>
  );
}
