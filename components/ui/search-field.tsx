"use client";

import { useId } from "react";

import { SearchBoldIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export interface SearchFieldProps {
  /** The current query. The caller owns the state. */
  value: string;
  /** Fires on every keystroke with the full new value. Debounce in the caller. */
  onChange: (value: string) => void;
  /**
   * The accessible name, rendered as a visually hidden label. Required, and
   * separate from the placeholder: a placeholder disappears the moment someone
   * types and is not a name a screen reader can rely on. Pass a translated
   * string; this primitive knows nothing about the message catalogue.
   */
  label: string;
  /** Optional hint drawn inside the field. Never the accessible name. */
  placeholder?: string;
  /** Blocks input. The field dims and stops taking focus. */
  disabled?: boolean;
  /** Input id. One is generated when omitted. */
  id?: string;
  /** Extra classes on the field, for the width a given screen wants. */
  className?: string;
}

/**
 * The pill search box the Spot and memecoin screens sit above their lists.
 * Generic on purpose: it holds no query state, does no fetching and knows
 * nothing about what is being searched, so it stays below the feature line.
 *
 * Figma: Spot Main Content, "Search Input Box" (173:42023). 42px tall, the
 * standard 2.0 white wash inside a hairline, fully rounded, 13px text.
 */
export function SearchField({
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
  id,
  className,
}: SearchFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div
      data-disabled={disabled || undefined}
      className={cn(
        "border-hairline bg-surface focus-within:ring-ring/50 flex h-[42px] w-full items-center gap-[6px] rounded-full border px-[9px] transition-colors focus-within:ring-2 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <span className="text-grey-500 flex size-[13px] shrink-0 items-center justify-center">
        <SearchBoldIcon size={13} />
      </span>
      <input
        id={inputId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        // The browser's own clear affordance is hidden: the design draws no
        // clear button, and a native one would only appear in some browsers.
        className="placeholder:text-grey-500 min-w-0 flex-1 bg-transparent font-sans text-[13px] font-normal text-white outline-none disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
      />
    </div>
  );
}
