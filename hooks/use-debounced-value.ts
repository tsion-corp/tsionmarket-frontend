"use client";

import { useEffect, useState } from "react";

// Returns a copy of `value` that only updates after it stops changing for
// `delayMs`. Used to keep fast typing from spamming the quote API.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
