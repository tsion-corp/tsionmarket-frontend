"use client";

import { createContext, useContext, useMemo, useRef } from "react";

// Lets a casino screen intercept the chrome's back link.
//
// The back link lives in CasinoPage, above every screen, but only the screen
// knows whether leaving is safe: a game in progress has to be resigned, not
// walked out of. Rather than teaching the chrome about chess, a screen
// registers a guard and the link asks it first.

type Guard = () => boolean;

interface CasinoNavGuard {
  // Register a guard, or pass null to clear it. Returning true means the guard
  // has taken over and navigation must not happen.
  setGuard: (guard: Guard | null) => void;
  blocked: () => boolean;
}

const NOOP: CasinoNavGuard = { setGuard: () => {}, blocked: () => false };

const CasinoNavGuardContext = createContext<CasinoNavGuard>(NOOP);

export function CasinoNavGuardProvider({ children }: { children: React.ReactNode }) {
  const guardRef = useRef<Guard | null>(null);
  const value = useMemo<CasinoNavGuard>(
    () => ({
      setGuard: (guard) => {
        guardRef.current = guard;
      },
      blocked: () => (guardRef.current ? guardRef.current() : false),
    }),
    []
  );

  return <CasinoNavGuardContext.Provider value={value}>{children}</CasinoNavGuardContext.Provider>;
}

// Safe outside a provider: screens rendered without the casino chrome (the
// invite landing) simply get a guard that never blocks.
export function useCasinoNavGuard(): CasinoNavGuard {
  return useContext(CasinoNavGuardContext);
}
