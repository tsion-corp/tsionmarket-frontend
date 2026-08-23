"use client";

import { useEffect, useId, useRef, useState } from "react";
import { COUNTRY_OPTIONS } from "./country-options";
import { LEADERBOARD_PERFS } from "./leaderboard-format";
import type {
  ChessLeaderboardCountry,
  ChessLeaderboardPerfKey,
} from "@/features/casino/lib/api/types";

interface FilterOption {
  value: string;
  label: string;
  flag?: string;
  detail?: string;
}

function Chevron() {
  return (
    <svg viewBox="0 0 12 8" className="size-3 text-white/45" fill="none" aria-hidden>
      <path d="m1 1.25 5 5 5-5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function FilterDropdown({
  label,
  value,
  options,
  searchable = false,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly FilterOption[];
  searchable?: boolean;
  onChange: (value: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value) ?? options[0];
  const normalizedSearch = search.trim().toLowerCase();
  const visibleOptions = normalizedSearch
    ? options.filter(
        (option) =>
          option.label.toLowerCase().includes(normalizedSearch) ||
          option.value.toLowerCase().includes(normalizedSearch)
      )
    : options;

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={`${label}: ${selected.label}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((current) => !current);
          setSearch("");
        }}
        className="flex h-[52px] w-full cursor-pointer items-center justify-between gap-3 px-4 text-left transition-colors hover:bg-white/[0.045]"
      >
        <span className="min-w-0">
          <span className="block text-[9px] font-bold tracking-[0.11em] text-white/32 uppercase">
            {label}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2">
            {selected.flag ? (
              <span className="text-[22px] leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.75)]">
                {selected.flag}
              </span>
            ) : null}
            <span className="truncate text-[14px] font-bold text-white/88">{selected.label}</span>
          </span>
        </span>
        <Chevron />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute top-[calc(100%+7px)] left-0 z-50 w-full min-w-[230px] overflow-hidden rounded-[9px] border border-[#3b4247] bg-[#171a1d] shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
        >
          {searchable ? (
            <label className="relative block border-b border-white/[0.07] p-2">
              <span className="sr-only">Search countries</span>
              <svg
                viewBox="0 0 24 24"
                className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-white/30"
                fill="none"
                aria-hidden
              >
                <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
                <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" />
              </svg>
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search country"
                className="h-9 w-full rounded-[6px] border border-white/[0.08] bg-black/25 pr-3 pl-9 text-[12px] text-white outline-none placeholder:text-white/25 focus:border-white/20"
              />
            </label>
          ) : null}
          <div className="max-h-[300px] [scrollbar-width:thin] [scrollbar-color:#495158_transparent] overflow-y-auto py-1">
            {visibleOptions.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value || "global"}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex h-10 w-full cursor-pointer items-center gap-2.5 px-3 text-left transition-colors ${
                    active ? "bg-white/[0.09] text-white" : "text-white/67 hover:bg-white/[0.055]"
                  }`}
                >
                  <span className="w-7 shrink-0 text-center text-[21px] leading-none drop-shadow-[0_1px_1px_rgba(0,0,0,0.75)]">
                    {option.flag ?? "🌐"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                    {option.label}
                  </span>
                  {option.detail ? (
                    <span className="tnum shrink-0 text-[10px] text-white/28">{option.detail}</span>
                  ) : null}
                  {active ? (
                    <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" aria-hidden>
                      <path d="m3 8.2 3 3L13 4.8" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
            {visibleOptions.length === 0 ? (
              <div className="px-4 py-7 text-center text-[12px] text-white/35">
                No country matches that search.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LeaderboardFilters({
  perf,
  country,
  representedCountries,
  onPerfChange,
  onCountryChange,
}: {
  perf: ChessLeaderboardPerfKey;
  country: string | null;
  representedCountries: readonly ChessLeaderboardCountry[];
  onPerfChange: (perf: ChessLeaderboardPerfKey) => void;
  onCountryChange: (country: string | null) => void;
}) {
  const counts = new Map(
    representedCountries.map((item) => [item.countryCode.toUpperCase(), item.playerCount])
  );
  const perfOptions = LEADERBOARD_PERFS.map((item) => ({
    value: item.value,
    label: item.label,
  }));
  const countryOptions: FilterOption[] = [
    { value: "", label: "Global", flag: "🌐" },
    ...COUNTRY_OPTIONS.map((item) => ({
      value: item.code,
      label: item.name,
      flag: item.flag,
      detail: counts.has(item.code) ? counts.get(item.code)?.toLocaleString() : undefined,
    })),
  ];

  return (
    <div className="grid overflow-visible rounded-[10px] border border-[#343a3f] bg-[#171a1d] sm:grid-cols-2 sm:divide-x sm:divide-[#343a3f]">
      <FilterDropdown
        label="Game type"
        value={perf}
        options={perfOptions}
        onChange={(value) => onPerfChange(value as ChessLeaderboardPerfKey)}
      />
      <div className="border-t border-[#343a3f] sm:border-t-0">
        <FilterDropdown
          label="Country"
          value={country ?? ""}
          options={countryOptions}
          searchable
          onChange={(value) => onCountryChange(value || null)}
        />
      </div>
    </div>
  );
}
