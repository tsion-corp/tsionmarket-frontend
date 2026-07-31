"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

// The spot terminal ships two interfaces over the same data layer, exactly like
// the perps desk: "simple" (one column, guided ticket) and "pro" (full terminal
// with candles and the market picker). Stored separately from the perp mode so
// a user can run a simple spot ticket next to a pro perps desk. Same idiom as
// perp-mode: a module-level store read through useSyncExternalStore, persisted
// under a versioned key, synced across tabs. Default is "simple".

export type SpotMode = "simple" | "pro";

const STORAGE_KEY = "wsws.spot-mode.v1";
const DEFAULT_MODE: SpotMode = "simple";

function isMode(value: unknown): value is SpotMode {
  return value === "simple" || value === "pro";
}

function readStored(): SpotMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isMode(saved)) return saved;
  } catch {
    // localStorage can throw in private mode. Fall back to the default.
  }
  return DEFAULT_MODE;
}

const listeners = new Set<() => void>();
let currentMode: SpotMode = DEFAULT_MODE;

function emit() {
  for (const notify of listeners) notify();
}

function setStoredMode(mode: SpotMode) {
  currentMode = mode;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
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
    if (event.key === STORAGE_KEY && isMode(event.newValue)) {
      currentMode = event.newValue;
      emit();
    }
  });
}

export function useSpotMode() {
  const mode = useSyncExternalStore(
    subscribe,
    () => currentMode,
    () => DEFAULT_MODE
  );

  // Hydrate the stored choice after mount. The server snapshot is always the
  // default, so reading localStorage during render would mismatch hydration.
  useEffect(() => {
    const stored = readStored();
    if (stored !== currentMode) setStoredMode(stored);
  }, []);

  return { mode, setMode: setStoredMode };
}

// The visible switch, identical in look and labels to the perps one so the two
// tabs read as one product.
export function SpotModeSwitch() {
  const t = useTranslations("perps");
  const { mode, setMode } = useSpotMode();
  return (
    <div
      className="ws-inset grid grid-cols-2 gap-1 p-1"
      role="group"
      aria-label={t("interfaceMode")}
    >
      {(["simple", "pro"] as const).map((m) => {
        const on = mode === m;
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            aria-pressed={on}
            className={`cursor-pointer rounded-xl px-5 py-2 font-sans text-[13px] font-medium transition-colors ${
              on
                ? "bg-accent/16 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
                : "text-white/55 hover:text-white/80"
            }`}
          >
            {m === "simple" ? t("modeSimple") : t("modePro")}
          </button>
        );
      })}
    </div>
  );
}
