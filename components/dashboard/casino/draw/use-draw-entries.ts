"use client";

import { useCallback, useState } from "react";

export interface DrawEntry {
  // Five main picks, stored sorted.
  main: number[];
  bonus: number;
  createdAt: number;
}

const STORAGE_KEY = "wsws.casino.draw-entries";

function readEntries(): DrawEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DrawEntry[]) : [];
  } catch {
    return [];
  }
}

// Confirmed draw entries for this session, kept in sessionStorage so they
// survive moving between the draw screen and My entries. Swap the storage for
// the draw API when the backend lands.
export function useDrawEntries() {
  const [entries, setEntries] = useState<DrawEntry[]>(readEntries);

  const addEntry = useCallback((main: number[], bonus: number) => {
    setEntries((prev) => {
      const next = [
        { main: [...main].sort((a, b) => a - b), bonus, createdAt: Date.now() },
        ...prev,
      ];
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Session storage being unavailable only loses persistence, not the UI.
      }
      return next;
    });
  }, []);

  return { entries, addEntry };
}
