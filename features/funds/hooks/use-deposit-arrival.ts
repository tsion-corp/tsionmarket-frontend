"use client";

import { useEffect, useRef, useState } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";

/**
 * Watches one token balance while a deposit sheet is open, and says when it goes up.
 *
 * The portfolio is cache-first and does not poll (hooks/use-portfolio.ts), so nothing else
 * tells a person their deposit landed. This asks for the one network the deposit settles
 * on, at a gentle pace, only while the sheet is open and the tab is visible, and gives up
 * after a while rather than running forever. It never changes the balance itself: it reads
 * the same portfolio the rest of the app shows.
 */

const POLL_MS = 8_000;
const GIVE_UP_MS = 15 * 60_000;

export type DepositArrival =
  | { state: "waiting" }
  | { state: "received"; raw: bigint; decimals: number }
  | { state: "stopped" };

export function useDepositArrival(input: {
  network: string;
  asset: string;
  enabled: boolean;
}): DepositArrival {
  const { network, asset, enabled } = input;
  const { tokens, loading, refetchFresh } = usePortfolio();
  const [result, setResult] = useState<DepositArrival>({ state: "waiting" });

  const token = tokens.find(
    (t) => t.network === network && t.address?.toLowerCase() === asset.toLowerCase()
  );
  const raw = BigInt(token?.rawBalance ?? "0");
  const decimals = token?.decimals ?? 6;

  // The balance when the watch began. Taken once, from the first real reading: a balance
  // that is still loading is not zero, and must not make the first reading look like money.
  const baseline = useRef<bigint | null>(null);
  useEffect(() => {
    if (!enabled || loading || baseline.current !== null) return;
    baseline.current = raw;
  }, [enabled, loading, raw]);

  useEffect(() => {
    if (!enabled || result.state !== "waiting") return;
    if (baseline.current !== null && raw > baseline.current) {
      setResult({ state: "received", raw: raw - baseline.current, decimals });
    }
  }, [enabled, raw, decimals, result.state]);

  const refetchRef = useRef(refetchFresh);
  useEffect(() => {
    refetchRef.current = refetchFresh;
  });

  useEffect(() => {
    if (!enabled || result.state !== "waiting") return;
    const startedAt = Date.now();
    let stopped = false;
    const tick = () => {
      if (stopped || document.visibilityState !== "visible") return;
      if (Date.now() - startedAt > GIVE_UP_MS) {
        setResult({ state: "stopped" });
        return;
      }
      void refetchRef.current([network]).catch(() => undefined);
    };
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [enabled, network, result.state]);

  return result;
}
