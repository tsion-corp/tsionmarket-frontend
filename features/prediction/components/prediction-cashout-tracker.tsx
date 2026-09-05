"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { fetchDepositStatus } from "@/hooks/use-deposit";
import { usePortfolio } from "@/hooks/use-portfolio";
import { recordSelfInitiated } from "@/lib/analytics/self-initiated";
import { depositProgress } from "@/lib/deposit";
import {
  clearPendingPredictionCashout,
  isPendingPredictionCashoutActive,
  pendingPredictionCashoutsSnapshot,
  serverPendingPredictionCashoutsSnapshot,
  subscribePendingPredictionCashouts,
} from "@/features/prediction/lib/pending-cashout";
import { toast } from "@/lib/toast";
import { getWalletAddress } from "@/lib/user";

const ACTIVE_POLL_MS = 4_000;
const PROVIDER_BACKOFF_MS = [30_000, 60_000, 120_000] as const;

// Reconciles Dextopus after the source USDC.e transfer. It is mounted above
// pages so closing Cashout or refreshing cannot lose the Base delivery status.
export function PredictionCashoutTracker() {
  const { user } = usePrivy();
  const { refetchFresh } = usePortfolio();
  const wallet = getWalletAddress(user, "ethereum")?.toLowerCase() ?? null;
  const pending = useSyncExternalStore(
    subscribePendingPredictionCashouts,
    pendingPredictionCashoutsSnapshot,
    serverPendingPredictionCashoutsSnapshot
  );

  useEffect(() => {
    for (const cashout of pending) {
      if (!isPendingPredictionCashoutActive(cashout, Date.now())) {
        clearPendingPredictionCashout(cashout.requestId);
      }
    }
  }, [pending]);

  useEffect(() => {
    const relevant = wallet
      ? pending.filter((cashout) => cashout.wallet.toLowerCase() === wallet)
      : [];
    if (relevant.length === 0) return;

    let cancelled = false;
    let running = false;
    let timer: number | null = null;
    let providerFailures = 0;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void reconcile(), delayMs);
    };

    const reconcile = async () => {
      if (cancelled || running || !navigator.onLine || document.visibilityState === "hidden") {
        return;
      }
      running = true;
      let nextDelay = ACTIVE_POLL_MS;
      try {
        for (const cashout of relevant) {
          try {
            const status = await fetchDepositStatus(cashout.requestId, "trade");
            if (status.providerUnavailable) {
              providerFailures += 1;
              nextDelay = Math.max(
                status.retryAfterMs ?? 0,
                PROVIDER_BACKOFF_MS[Math.min(providerFailures - 1, PROVIDER_BACKOFF_MS.length - 1)]
              );
              break;
            }

            providerFailures = 0;
            const { stage } = depositProgress(status.status, status.executionStatus);
            if (stage === "settled") {
              recordSelfInitiated(status.destinationTransactionHashes);
              clearPendingPredictionCashout(cashout.requestId);
              await refetchFresh();
              toast.success("Prediction cashout is now available in your Base USDC balance.");
            } else if (stage === "refunded") {
              clearPendingPredictionCashout(cashout.requestId);
              toast.info("The Base transfer was refunded on Polygon. You can retry from Cashout.");
            } else if (stage === "failed") {
              clearPendingPredictionCashout(cashout.requestId);
              toast.error("The Base transfer failed. Your recoverable funds remain in Cashout.");
            }
          } catch {
            providerFailures += 1;
            nextDelay =
              PROVIDER_BACKOFF_MS[Math.min(providerFailures - 1, PROVIDER_BACKOFF_MS.length - 1)];
            break;
          }
        }
      } finally {
        running = false;
        schedule(nextDelay);
      }
    };

    const wake = () => {
      if (navigator.onLine && document.visibilityState === "visible") schedule(0);
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    schedule(0);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [pending, refetchFresh, wallet]);

  return null;
}
