"use client";

import { useState } from "react";
import { FlagIcon } from "@/components/ui/flag-icon";
import { SearchIcon, CheckIcon, ChevronLeftIcon } from "@/components/ui/icons";
import { countryCurrency, searchPayoutCountries, type PayoutCountry } from "@/lib/cross-border";

interface CountryPickerProps {
  selected: PayoutCountry | null;
  onSelect: (country: PayoutCountry) => void;
}

// Destination-country selector. Collapsed it shows the current choice; expanded
// it is a searchable list of corridors. Kept self-contained so the destination
// step stays focused on assembling the payout target.
export function CountryPicker({ selected, onSelect }: CountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = searchPayoutCountries(query);

  if (open) {
    return (
      <div className="ws-inset overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/8 px-3.5 py-3">
          <button
            onClick={() => {
              setOpen(false);
              setQuery("");
            }}
            aria-label="Back"
            className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 hover:bg-white/8 hover:text-white"
          >
            <ChevronLeftIcon size={15} />
          </button>
          <SearchIcon />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search country"
            className="w-full border-none bg-transparent text-[14px] font-normal text-white outline-none"
          />
        </div>
        <div className="max-h-[240px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] font-normal text-white/45">
              No country matches “{query}”.
            </div>
          ) : (
            results.map((c) => {
              const isSelected = selected?.code === c.code;
              return (
                <button
                  key={c.code}
                  onClick={() => {
                    onSelect(c);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/5"
                >
                  <FlagIcon code={c.currency} symbol={c.currency} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-sans text-[14px] font-medium text-white">
                      {c.name}
                    </span>
                    <span className="block text-[12px] font-normal text-white/50">
                      {countryCurrency(c).name}
                    </span>
                  </span>
                  {isSelected ? (
                    <span className="text-accent">
                      <CheckIcon size={17} />
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setOpen(true)}
      className="ws-inset flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/5"
    >
      {selected ? (
        <>
          <FlagIcon code={selected.currency} symbol={selected.currency} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-sans text-[14.5px] font-medium text-white">
              {selected.name}
            </span>
            <span className="block text-[12px] font-normal text-white/50">
              Pays out in {selected.currency}
            </span>
          </span>
        </>
      ) : (
        <>
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-white/8 text-white/50">
            <SearchIcon />
          </span>
          <span className="flex-1 font-sans text-[14.5px] font-normal text-white/55">
            Select destination country
          </span>
        </>
      )}
      <span className="text-accent text-[12px] font-medium">Change</span>
    </button>
  );
}
