"use client";

import { useCallback, useSyncExternalStore } from "react";

// One-time acknowledgement that prediction trading carries real financial /
// gambling risk. Persisted in localStorage; gates the trading UI until accepted.
const KEY = "wsws.prediction-consent.v1";

function subscribe(onChange: () => void) {
  window.addEventListener("wsws-consent", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("wsws-consent", onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function usePredictionConsent() {
  const accepted = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const accept = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, "true");
      // storage events don't fire in the same tab, so notify explicitly.
      window.dispatchEvent(new Event("wsws-consent"));
    } catch {
      // localStorage unavailable — consent simply won't persist.
    }
  }, []);

  return { accepted, accept };
}
