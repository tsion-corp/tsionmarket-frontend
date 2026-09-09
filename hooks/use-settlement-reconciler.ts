"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets as useSolanaWallets } from "@privy-io/react-auth/solana";
import { fetchDepositStatus } from "@/hooks/use-deposit";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSolanaToBase } from "@/hooks/use-solana-to-base";
import { depositProgress, settlementFor } from "@/lib/deposit";
import { toast } from "@/lib/toast";
import { getWalletAddress } from "@/lib/user";
import { fetchConfirmedSolanaBalance } from "@/lib/trade/solana-balance";
import {
  clearPendingRwaSettlement,
  isPendingRwaSettlementActive,
  pendingRwaSettlementsSnapshot,
  rwaSaleProceedsRaw,
  savePendingRwaSettlement,
  serverPendingRwaSettlementsSnapshot,
  settlementsForProduct,
  subscribePendingRwaSettlements,
  type PendingRwaSettlement,
  type SettlementProduct,
} from "@/lib/trade/pending-settlement";

const ACTIVE_RECONCILE_MS = 8_000;
// Every settlement here is a move between Base and Solana.
const CROSS_CHAIN = ["base-mainnet", "solana-mainnet"] as const;
const PROVIDER_BACKOFF_MS = [30_000, 60_000, 120_000] as const;

export interface SettlementMessages {
  fundReady: (symbol: string) => string;
  fundFailed: () => string;
  proceedsReady: (symbol: string) => string;
  proceedsFailed: () => string;
}

export interface SettlementReconcilerOptions {
  product: SettlementProduct;
  // Finish a Base-to-Solana purchase once USDC is in the Solana wallet.
  // `balance` is the confirmed Solana USDC balance. Return false when the
  // delivery has not landed yet (the reconciler asks again); return true once
  // the purchase is handled, whether it succeeded or failed for good, and
  // clear the entry yourself in that case.
  completePurchase: (
    settlement: PendingRwaSettlement,
    context: { solanaTaker: string; balance: bigint }
  ) => Promise<boolean>;
  messages: SettlementMessages;
}

// The cross-chain settlement loop shared by every product that funds a Solana
// purchase from Base USDC or routes Solana sale proceeds back to Base. It is a
// state-driven reconciler, not a fixed poll: a saved transfer, reconnect, tab
// activation, provider transition or scheduled backoff advances the state
// machine exactly once. Mount it at dashboard scope, never in a sheet, so a
// closed sheet or a reload cannot strand funds on Solana.
//
// What is product-specific is how a funded purchase is completed and what the
// user is told; the caller supplies both.
export function useSettlementReconciler({
  product,
  completePurchase,
  messages,
}: SettlementReconcilerOptions): void {
  const { user } = usePrivy();
  const { wallets: solanaWallets } = useSolanaWallets();
  const settleSolanaToBase = useSolanaToBase();
  const { refetchFresh } = usePortfolio();
  const executingRef = useRef(new Set<string>());
  // The callers' callbacks and the hooks above take new identities on
  // unrelated renders (a portfolio poll, a wallet list refresh). Read the
  // latest through refs so the loop below restarts only when the pending
  // set or the wallet's readiness changes, never on a render.
  const latest = useRef({ completePurchase, messages, settleSolanaToBase, refetchFresh });
  useEffect(() => {
    latest.current = { completePurchase, messages, settleSolanaToBase, refetchFresh };
  }, [completePurchase, messages, settleSolanaToBase, refetchFresh]);
  const all = useSyncExternalStore(
    subscribePendingRwaSettlements,
    pendingRwaSettlementsSnapshot,
    serverPendingRwaSettlementsSnapshot
  );
  const pending = settlementsForProduct(all, product);
  const pendingKey = pending.map((s) => s.requestId).join("|");

  useEffect(() => {
    for (const settlement of pending) {
      if (!isPendingRwaSettlementActive(settlement, Date.now())) {
        clearPendingRwaSettlement(settlement.requestId);
      }
    }
    // The list identity changes on every snapshot; its ids are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  const solanaTaker = getWalletAddress(user, "solana");
  const solanaWalletReady =
    solanaTaker !== null && solanaWallets.some((wallet) => wallet.address === solanaTaker);

  useEffect(() => {
    if (pending.length === 0) return;
    let cancelled = false;
    let reconciling = false;
    let timer: number | null = null;
    let providerFailures = 0;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void reconcile(), delayMs);
    };

    const usdc = settlementFor("solana");

    const finishPurchase = async (settlement: PendingRwaSettlement): Promise<boolean> => {
      if (!settlement.purchase || !solanaTaker || !solanaWalletReady) return false;
      if (executingRef.current.has(settlement.requestId)) return false;
      const balance = await fetchConfirmedSolanaBalance(solanaTaker, usdc.asset);
      executingRef.current.add(settlement.requestId);
      try {
        return await latest.current.completePurchase(settlement, { solanaTaker, balance });
      } finally {
        executingRef.current.delete(settlement.requestId);
      }
    };

    const startSaleSettlement = async (
      settlement: PendingRwaSettlement
    ): Promise<"waiting" | "started" | "retry"> => {
      const sale = settlement.sale;
      if (!sale || !solanaTaker || !solanaWalletReady) return "waiting";
      if (executingRef.current.has(settlement.requestId)) return "waiting";

      const balance = await fetchConfirmedSolanaBalance(solanaTaker, usdc.asset);
      const proceedsRaw = rwaSaleProceedsRaw(
        BigInt(sale.startingUsdcRaw),
        BigInt(sale.minimumProceedsRaw),
        BigInt(sale.expectedProceedsRaw),
        balance
      );
      if (proceedsRaw === 0n) return "waiting";

      executingRef.current.add(settlement.requestId);
      try {
        const result = await latest.current.settleSolanaToBase({
          asset: usdc.asset,
          decimals: usdc.decimals,
          amount: proceedsRaw,
          slippageBps: sale.slippageBps,
        });
        clearPendingRwaSettlement(settlement.requestId);
        savePendingRwaSettlement({
          requestId: result.requestId,
          product,
          direction: "solana-to-base",
          assetSymbol: settlement.assetSymbol,
          createdAt: Date.now(),
        });
        await latest.current.refetchFresh(CROSS_CHAIN);
        return "started";
      } catch (error) {
        // Quote/provider failures happen before the transfer and are safe to
        // retry. The executor persists the Dextopus request once it
        // broadcasts, so an ambiguous provider submit never causes a second
        // wallet send.
        console.warn("Background sale settlement deferred", error);
        return "retry";
      } finally {
        executingRef.current.delete(settlement.requestId);
      }
    };

    const backoff = () =>
      PROVIDER_BACKOFF_MS[Math.min(providerFailures - 1, PROVIDER_BACKOFF_MS.length - 1)];

    const reconcile = async () => {
      if (cancelled || reconciling || document.visibilityState === "hidden" || !navigator.onLine) {
        return;
      }
      reconciling = true;
      let nextDelay = ACTIVE_RECONCILE_MS;
      try {
        for (const settlement of pending) {
          if (cancelled || !isPendingRwaSettlementActive(settlement, Date.now())) continue;
          try {
            if (settlement.sale) {
              if ((await startSaleSettlement(settlement)) === "retry") {
                providerFailures += 1;
                nextDelay = backoff();
              }
              continue;
            }

            // Destination chain state is authoritative. If USDC is already in
            // the wallet, finish the purchase even when Dextopus's reporting
            // API is unavailable.
            if (settlement.direction === "base-to-solana" && settlement.purchase) {
              if (await finishPurchase(settlement)) continue;
            }

            const status = await fetchDepositStatus(settlement.requestId, "trade");
            if (status.providerUnavailable) {
              providerFailures += 1;
              nextDelay = Math.max(status.retryAfterMs ?? 0, backoff());
              // One unavailable response represents the shared provider. Do
              // not multiply it by every pending settlement in this account.
              break;
            }

            providerFailures = 0;
            const { stage } = depositProgress(status.status, status.executionStatus);
            if (stage === "settled") {
              if (settlement.direction === "solana-to-base") {
                clearPendingRwaSettlement(settlement.requestId);
                await latest.current.refetchFresh(CROSS_CHAIN);
                toast.success(latest.current.messages.proceedsReady(settlement.assetSymbol));
              } else if (!settlement.purchase) {
                clearPendingRwaSettlement(settlement.requestId);
                await latest.current.refetchFresh(CROSS_CHAIN);
                toast.success(latest.current.messages.fundReady(settlement.assetSymbol));
              } else {
                await finishPurchase(settlement);
              }
            } else if (stage === "failed" || stage === "refunded") {
              clearPendingRwaSettlement(settlement.requestId);
              toast.error(
                settlement.direction === "base-to-solana"
                  ? latest.current.messages.fundFailed()
                  : latest.current.messages.proceedsFailed()
              );
            }
          } catch {
            providerFailures += 1;
            nextDelay = backoff();
            break;
          }
        }
      } finally {
        reconciling = false;
        schedule(nextDelay);
      }
    };

    const wake = () => {
      if (document.visibilityState === "visible" && navigator.onLine) schedule(0);
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
    // `pending` is re-derived each render; its ids drive this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, product, solanaTaker, solanaWalletReady]);
}
