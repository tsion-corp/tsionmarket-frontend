"use client";

import { useId } from "react";

// The earn forms are long, and this app has no form primitives. This keeps
// label, control, hint and error wiring in one place so every field is
// labelled and every error is announced, rather than each form doing it again
// slightly differently.

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  type?: "text" | "url" | "datetime-local";
  required?: boolean;
}

const INPUT =
  "ws-inset focus:border-accent/50 w-full rounded-[12px] px-3.5 py-2.5 font-sans text-[13px] text-white outline-none placeholder:text-white/25";

export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  type = "text",
  required = false,
}: FieldProps) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
  rows = 5,
  required = false,
}: FieldProps & { rows?: number }) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <textarea
        id={id}
        value={value}
        rows={rows}
        required={required}
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`${INPUT} resize-y`}
      />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  error,
  hint,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  error?: string;
  hint?: string;
}) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <select
        id={id}
        value={value}
        aria-invalid={!!error}
        onChange={(event) => onChange(event.target.value as T)}
        className={`${INPUT} cursor-pointer`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-sheet">
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent mt-0.5 size-4 cursor-pointer"
      />
      <span>
        <span className="font-sans text-[13px] font-medium text-white/85">{label}</span>
        {hint ? (
          <span className="block font-sans text-[12px] font-normal text-white/45">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-sans text-[12.5px] font-medium text-white/70">
        {label}
        {required ? <span className="text-white/35"> *</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <span className="font-sans text-[11.5px] font-normal text-white/40">{hint}</span>
      ) : null}
      {error ? (
        <span
          id={`${id}-error`}
          role="alert"
          className="text-down font-sans text-[12px] font-normal"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
