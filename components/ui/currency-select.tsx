"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useFx } from "@/hooks/use-fx";
import {
  CURRENCIES,
  DEFAULT_CURRENCY,
  findCurrency,
  formatMoney,
  searchCurrencies,
  type Currency,
} from "@/lib/currencies";
import { CheckIcon, SearchIcon } from "@/components/ui/icons";
import { FlagIcon } from "@/components/ui/flag-icon";

// Versioned so the stored value can be migrated later without reading a stale shape.
const STORAGE_KEY = "wsws.display-currency.v1";

const USD = CURRENCIES.find((c) => c.code === DEFAULT_CURRENCY) ?? CURRENCIES[0];

function readStored(): string {
  if (typeof window === "undefined") return DEFAULT_CURRENCY;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && findCurrency(saved)) return saved;
  } catch {
    // localStorage can throw in private mode. Fall back to the default.
  }
  return DEFAULT_CURRENCY;
}

// Module-level store so every BalanceCard and holdings row shares one selection
// and updates live the moment the user picks a currency.
const listeners = new Set<() => void>();
let currentCode = DEFAULT_CURRENCY;

function emit() {
  for (const notify of listeners) notify();
}

function setStoredCode(code: string) {
  if (!findCurrency(code)) return;
  currentCode = code;
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // A failed write still updates the in-memory selection.
  }
  emit();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue && findCurrency(event.newValue)) {
      currentCode = event.newValue;
      emit();
    }
  });
}

export function useCurrency() {
  const code = useSyncExternalStore(
    subscribe,
    () => currentCode,
    () => DEFAULT_CURRENCY
  );

  useEffect(() => {
    const stored = readStored();
    if (stored !== currentCode) setStoredCode(stored);
  }, []);

  return {
    currency: findCurrency(code) ?? USD,
    setCurrency: setStoredCode,
  };
}

// Binds the selected currency to the live FX rate and returns a formatter.
// When a rate is not available yet, values fall back to USD so the magnitude
// shown is never wrong, only briefly less localized.
export function useMoney() {
  const { currency, setCurrency } = useCurrency();
  const { rate } = useFx();
  const resolved = rate(currency.code);
  const ready = resolved != null;
  const active = ready ? currency : USD;
  const activeRate = resolved ?? 1;

  return {
    currency,
    setCurrency,
    ready,
    format: (amountUsd: number) => formatMoney(amountUsd, active, activeRate),
  };
}

interface CurrencySelectProps {
  value: Currency;
  onSelect: (code: string) => void;
}

export function CurrencySelect({ value, onSelect }: CurrencySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [desktop, setDesktop] = useState(false);
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const results = searchCurrencies(query);
  const groups: { label: string; items: Currency[] }[] = [
    { label: "Africa", items: results.filter((c) => c.region === "Africa") },
    { label: "Global", items: results.filter((c) => c.region === "Global") },
  ];

  const choose = (code: string) => {
    onSelect(code);
    close();
  };

  const panelMotion = desktop
    ? {
        initial: { opacity: 0, y: -6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.15 },
      }
    : reduce
      ? {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          exit: { opacity: 0 },
          transition: { duration: 0.15 },
        }
      : {
          initial: { y: "100%" },
          animate: { y: 0 },
          exit: { y: "100%" },
          transition: { type: "spring" as const, stiffness: 380, damping: 38, mass: 0.9 },
        };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Display currency"
        className="flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pr-2 pl-1.5 font-sans text-[12px] font-semibold tracking-[0.02em] text-white transition-colors hover:bg-white/10"
      >
        <FlagIcon code={value.code} symbol={value.symbol} size={20} />
        <span className="tnum">{value.code}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white/45"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={close}
              className="fixed inset-0 z-[300] bg-black/50 backdrop-blur-[3px] md:bg-transparent md:backdrop-blur-none"
            />
            <motion.div
              {...panelMotion}
              role="listbox"
              className="bg-sheet fixed inset-x-0 bottom-0 z-[301] max-h-[70vh] overflow-hidden rounded-t-[24px] border border-white/14 pt-4 shadow-[0_-20px_90px_-30px_rgba(0,0,0,0.9)] md:absolute md:inset-x-auto md:top-[calc(100%+8px)] md:right-0 md:bottom-auto md:max-h-[360px] md:w-[300px] md:rounded-[18px] md:pt-3"
            >
              <span
                aria-hidden
                className="mx-auto mb-3 block h-1 w-9 rounded-full bg-white/20 md:hidden"
              />
              <div className="px-3 pb-2 md:px-2.5">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <SearchIcon size={15} />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search currency"
                    className="w-full bg-transparent font-sans text-[13.5px] font-normal text-white outline-none"
                  />
                </div>
              </div>
              <div className="max-h-[calc(70vh-92px)] overflow-y-auto px-1.5 pb-4 md:max-h-[280px] md:pb-2">
                {results.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[13px] font-normal text-white/40">
                    No currencies found
                  </div>
                ) : (
                  groups.map((group) =>
                    group.items.length === 0 ? null : (
                      <div key={group.label} className="mb-1">
                        <div className="px-3 pt-2 pb-1 text-[10.5px] font-medium tracking-[0.1em] text-white/35 uppercase">
                          {group.label}
                        </div>
                        {group.items.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            role="option"
                            aria-selected={c.code === value.code}
                            onClick={() => choose(c.code)}
                            className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/6"
                          >
                            <FlagIcon code={c.code} symbol={c.symbol} size={30} />
                            <span className="min-w-0 flex-1">
                              <span className="block font-sans text-[13.5px] font-medium">
                                {c.code}
                              </span>
                              <span className="block truncate text-[11.5px] font-normal text-white/50">
                                {c.name}
                              </span>
                            </span>
                            {c.code === value.code ? (
                              <CheckIcon size={16} className="text-accent" />
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )
                  )
                )}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
