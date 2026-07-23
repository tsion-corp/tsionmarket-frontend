"use client";

import { useEffect, useRef, useState } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { formatAmount } from "@/lib/trade/math";
import { toast } from "@/lib/toast";
import type { DirectNetwork } from "@/lib/deposit";

// Ignore sub-unit noise so a real deposit, not a rounding wobble, trips the
// detection.
const EPSILON = 1e-6;

export interface DepositWatch {
  received: number | null;
  checking: boolean;
  checkNow: () => void;
}

// Watches the USDC balance on a direct-deposit network. It snapshots the balance
// when the network is opened, then compares each portfolio update against that
// snapshot. The first increase is reported as a received deposit, once.
export function useDepositWatch(network: DirectNetwork | null): DepositWatch {
  const { tokens, loading, refetch } = usePortfolio();
  const [detected, setDetected] = useState<{ key: string; amount: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const baseline = useRef<{ key: string; value: number } | null>(null);
  const notified = useRef(false);

  const balance = network
    ? (tokens.find((t) => t.symbol === network.assetSymbol && t.network === network.networkKey)
        ?.balance ?? 0)
    : 0;

  // Derived so switching networks clears the last detection without a reset
  // effect: a detection only counts for the network it was found on.
  const received =
    detected && network && detected.key === network.networkKey ? detected.amount : null;

  useEffect(() => {
    if (!network) {
      baseline.current = null;
      notified.current = false;
      return;
    }

    // A newly opened network snapshots the current balance and pulls a fresh
    // reading so the baseline reflects the moment the screen opened.
    if (!baseline.current || baseline.current.key !== network.networkKey) {
      if (loading) return;
      baseline.current = { key: network.networkKey, value: balance };
      notified.current = false;
      void refetch();
      return;
    }

    if (loading) return;
    const delta = balance - baseline.current.value;
    if (!notified.current && delta > EPSILON) {
      notified.current = true;
      setDetected({ key: network.networkKey, amount: delta });
      toast.success(`Deposit received. ${formatAmount(delta)} ${network.assetSymbol} added.`);
    }
  }, [network, balance, loading, refetch]);

  const checkNow = () => {
    setChecking(true);
    void refetch().finally(() => setChecking(false));
  };

  return { received, checking, checkNow };
}
