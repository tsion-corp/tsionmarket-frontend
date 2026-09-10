"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

export type InterfaceMode = "simple" | "pro";

// Factory for a persisted simple/pro interface switch — the store idiom
// perp-mode established (module store + useSyncExternalStore + versioned key +
// cross-tab sync), extracted so new trading surfaces don't copy it again.
export function createInterfaceMode(storageKey: string) {
  let current: InterfaceMode = "simple";
  const listeners = new Set<() => void>();

  const isMode = (v: unknown): v is InterfaceMode => v === "simple" || v === "pro";

  const read = (): InterfaceMode => {
    if (typeof window === "undefined") return "simple";
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (isMode(saved)) return saved;
    } catch {
      /* private mode */
    }
    return "simple";
  };

  const set = (mode: InterfaceMode) => {
    current = mode;
    try {
      window.localStorage.setItem(storageKey, mode);
    } catch {
      /* in-memory only */
    }
    for (const notify of listeners) notify();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === storageKey && isMode(event.newValue)) {
        current = event.newValue;
        for (const notify of listeners) notify();
      }
    });
  }

  function useMode() {
    const mode = useSyncExternalStore(
      (notify) => {
        listeners.add(notify);
        return () => listeners.delete(notify);
      },
      () => current,
      () => "simple" as InterfaceMode
    );
    useEffect(() => {
      const stored = read();
      if (stored !== current) set(stored);
    }, []);
    return { mode, setMode: set };
  }

  function ModeSwitch() {
    const t = useTranslations("perps");
    const { mode, setMode } = useMode();
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

  return { useMode, ModeSwitch };
}
