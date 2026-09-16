"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useFx } from "@/hooks/use-fx";
import { track } from "@/lib/analytics/mixpanel";
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
import { Portal } from "@/components/ui/portal";

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

  // Wrapped so every switch is reported, wherever the picker is mounted.
  // Selecting the currency already in use is not a switch.
  const setCurrency = useCallback(
    (next: string) => {
      if (next !== code) track("currency_switched", { currency: next });
      setStoredCode(next);
    },
    [code]
  );

  return {
    currency: findCurrency(code) ?? USD,
    setCurrency,
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
    // For the amount of a transaction rather than the size of a holding: what
    // is staked, paid out, or charged. Those are never abbreviated.
    formatExact: (amountUsd: number) => formatMoney(amountUsd, active, activeRate, { exact: true }),
  };
}

interface CurrencySelectProps {
  value: Currency;
  onSelect: (code: string) => void;
  /** "lg" is the mobile design's oversized pill on the starfield balance card. */
  size?: "sm" | "lg";
}

// Geometry for the desktop panel. It hangs off the viewport rather than off the
// trigger's own box, because the cards that host this picker clip their
// overflow: the desktop balance card
// (features/portfolio/components/balance-card-desktop.tsx) carries
// `overflow-hidden` on its root so the starfield artwork stays inside the
// rounded corners, and an absolutely positioned panel inside it was cut off
// flat at the card's foot: at 1440x900 the panel ran to y=574 while the card
// ended at y=474, so the last 80px of it, and any sign that the list scrolled
// at all, were simply gone. A fixed panel's containing block is the viewport,
// so no ancestor's overflow reaches it. The height is then capped to the room
// actually there, and the list scrolls inside the panel rather than running
// past the window.
const PANEL_GAP = 8;
const PANEL_MARGIN = 12;
/** The design's height for the panel. */
const PANEL_MAX_HEIGHT = 360;
/** Under this the panel opens upwards instead, if there is more room there. */
const PANEL_MIN_HEIGHT = 180;
/** Floor for a window too short for either side. The list still scrolls. */
const PANEL_FLOOR_HEIGHT = 96;

interface PanelPlacement {
  /** One of the two is set; the other stays auto. */
  top?: number;
  bottom?: number;
  right: number;
  maxHeight: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

// Places the panel against the viewport: under the trigger when the space
// below can hold a usable list, above it when it cannot and the space above is
// larger. Both edges stay inside the window, so the tail of the list is always
// on screen and scrollable.
export function placeCurrencyPanel(
  trigger: { top: number; bottom: number; right: number },
  viewport: { width: number; height: number }
): PanelPlacement {
  const below = viewport.height - trigger.bottom - PANEL_GAP - PANEL_MARGIN;
  const above = trigger.top - PANEL_GAP - PANEL_MARGIN;
  const flip = below < PANEL_MIN_HEIGHT && above > below;
  const room = flip ? above : below;
  const maxHeight = clamp(room, PANEL_FLOOR_HEIGHT, PANEL_MAX_HEIGHT);
  // The panel is right-aligned to the trigger, as the design draws it.
  const right = clamp(viewport.width - trigger.right, PANEL_MARGIN, viewport.width - PANEL_MARGIN);
  // The far edge is pinned inside the window even when the floor above had to
  // win, so a very short window loses list height rather than the list itself.
  const furthest = Math.max(PANEL_MARGIN, viewport.height - PANEL_MARGIN - maxHeight);
  return flip
    ? { bottom: Math.min(viewport.height - trigger.top + PANEL_GAP, furthest), right, maxHeight }
    : { top: Math.min(trigger.bottom + PANEL_GAP, furthest), right, maxHeight };
}

function samePlacement(a: PanelPlacement, b: PanelPlacement) {
  return (
    a.top === b.top && a.bottom === b.bottom && a.right === b.right && a.maxHeight === b.maxHeight
  );
}

export function CurrencySelect({ value, onSelect, size = "sm" }: CurrencySelectProps) {
  const large = size === "lg";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [desktop, setDesktop] = useState(false);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);
  const panelId = useId();
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // True once the panel has been opened, so the close path can tell a real
  // close from the first render.
  const opened = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const next = placeCurrencyPanel(trigger.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    setPlacement((prev) => (prev && samePlacement(prev, next) ? prev : next));
  }, []);

  // Measured before the panel is shown, so it opens in the right place rather
  // than moving there on the next frame.
  const openPanel = () => {
    measure();
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  useEffect(() => {
    if (!open) {
      // The panel's own focus dies with it, so hand focus back to the trigger
      // rather than dropping it on the body. Not on the first render, which
      // has closed nothing.
      if (opened.current) triggerRef.current?.focus();
      return;
    }
    opened.current = true;
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

  // A viewport-anchored panel does not travel with the trigger, so it is
  // re-placed whenever the page moves under it. Capture phase because the card
  // can sit in a scroller of its own, which does not bubble a scroll event.
  useEffect(() => {
    if (!open || !desktop) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, desktop, measure]);

  const results = searchCurrencies(query);
  const groups: { label: string; items: Currency[] }[] = [
    { label: "Africa", items: results.filter((c) => c.region === "Africa") },
    { label: "Global", items: results.filter((c) => c.region === "Global") },
  ];

  const choose = (code: string) => {
    onSelect(code);
    close();
  };

  // Null on the phone, where the panel is the full-width bottom sheet and
  // needs no measuring.
  const anchored = desktop ? placement : null;

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
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openPanel())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label="Display currency"
        className={`ws-pressable flex cursor-pointer items-center rounded-full border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 ${
          large
            ? "h-[46px] gap-[9px] py-[6px] pr-3 pl-[9px] font-serif text-[18px] font-semibold tracking-[-0.09px]"
            : "gap-1.5 py-1 pr-2 pl-1.5 font-sans text-[12px] font-semibold tracking-[0.02em]"
        }`}
      >
        <FlagIcon code={value.code} symbol={value.symbol} size={large ? 31 : 20} />
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

      {/* Rendered at the end of <body>. The panel is placed against the
          viewport, so it needs nothing from its position in the tree, and
          out here it is no longer sealed inside the host card's stacking
          context: the desktop balance card is `isolate`, which capped the
          panel below the app's own chrome (the sticky topbar at z-60, the
          support button at z-80, the tab bar at z-90) however high its own
          z-index went. The trigger keeps the panel by aria-controls, and the
          search field is focused on open and the trigger on close, so nothing
          that depended on the two being nested is lost. */}
      <Portal>
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
                id={panelId}
                role="listbox"
                // The desktop panel is placed in JS (see placeCurrencyPanel), so
                // it carries no positioning classes of its own past `fixed`.
                style={
                  anchored
                    ? {
                        top: anchored.top,
                        bottom: anchored.bottom,
                        right: anchored.right,
                        maxHeight: anchored.maxHeight,
                      }
                    : undefined
                }
                className={`bg-sheet fixed z-[301] flex flex-col overflow-hidden border border-white/14 ${
                  anchored
                    ? "w-[300px] rounded-[18px] pt-3"
                    : "inset-x-0 bottom-0 max-h-[70vh] rounded-t-[24px] pt-4 shadow-[0_-20px_90px_-30px_rgba(0,0,0,0.9)]"
                }`}
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
                {/* The list, not the panel, is what scrolls. The panel is capped
                  at the room the viewport has, so whatever does not fit is
                  reachable here rather than hidden past the panel's edge. */}
                <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4 md:pb-2">
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
      </Portal>
    </div>
  );
}
