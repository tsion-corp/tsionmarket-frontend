"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets as useSolanaWallets } from "@privy-io/react-auth/solana";
import { useTranslations } from "next-intl";
import { useExecuteRwa } from "@/features/rwa/hooks/use-execute-rwa";
import { buildRwaAction, USDC_BY_CHAIN } from "@/features/rwa/lib/api";
import { fetchDepositStatus } from "@/hooks/use-deposit";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSolanaToBase } from "@/hooks/use-solana-to-base";
import { depositProgress } from "@/lib/deposit";
import { track } from "@/lib/analytics/mixpanel";
import { toast } from "@/lib/toast";
import { getWalletAddress } from "@/lib/user";
import { fetchConfirmedSolanaBalance } from "@/lib/trade/solana-balance";
import {
  clearPendingRwaSettlement,
  isPendingRwaSettlementActive,
  pendingRwaSettlementsSnapshot,
  rwaPurchaseSpendRaw,
  rwaSaleProceedsRaw,
  savePendingRwaSettlement,
  serverPendingRwaSettlementsSnapshot,
  subscribePendingRwaSettlements,
} from "@/lib/trade/pending-settlement";

const ACTIVE_RECONCILE_MS = 8_000;
const PROVIDER_BACKOFF_MS = [30_000, 60_000, 120_000] as const;

// Mounted at dashboard scope, not in the trade sheet. It owns both the
// post-sale Dextopus handoff and provider reconciliation, so closing the sheet
// or reloading cannot strand confirmed sale proceeds on Solana.
export function RwaSettlementTracker() {
  const t = useTranslations("rwa");
  const { user } = usePrivy();
  const { wallets: solanaWallets } = useSolanaWallets();
  const execute = useExecuteRwa();
  const settleSolanaToBase = useSolanaToBase();
  const { refetchFresh, refetchUntilChanged } = usePortfolio();
  const executingRef = useRef(new Set<string>());
  const pending = useSyncExternalStore(
    subscribePendingRwaSettlements,
    pendingRwaSettlementsSnapshot,
    serverPendingRwaSettlementsSnapshot
  );

  useEffect(() => {
    for (const settlement of pending) {
      if (!isPendingRwaSettlementActive(settlement, Date.now())) {
        clearPendingRwaSettlement(settlement.requestId);
      }
    }
  }, [pending]);

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

    const completePurchase = async (settlement: (typeof pending)[number]): Promise<boolean> => {
      const purchase = settlement.purchase;
      if (!purchase || !solanaTaker || !solanaWalletReady) return false;
      if (executingRef.current.has(settlement.requestId)) return false;

      const payToken = USDC_BY_CHAIN.solana;
      const balance = await fetchConfirmedSolanaBalance(solanaTaker, payToken.address);
      const requestedRaw = BigInt(purchase.amountInRaw);
      const amountInRaw =
        purchase.startingUsdcRaw === undefined
          ? requestedRaw < balance
            ? requestedRaw
            : balance
          : rwaPurchaseSpendRaw(requestedRaw, BigInt(purchase.startingUsdcRaw), balance);
      const minimumDeliveryRaw = BigInt(purchase.minimumDeliveryRaw ?? "1");
      if (amountInRaw < minimumDeliveryRaw) return false;

      executingRef.current.add(settlement.requestId);
      try {
        const action = await buildRwaAction({
          chain: "solana",
          inputToken: payToken.address,
          outputToken: purchase.assetAddress,
          amountIn: amountInRaw.toString(),
          slippageBps: purchase.slippageBps,
          taker: solanaTaker,
          simulate: false,
        });
        await execute(action, "solana");
        clearPendingRwaSettlement(settlement.requestId);
        await refetchFresh();
        void refetchUntilChanged();
        track("trade_completed", {
          vertical: "real_asset",
          asset: purchase.assetSymbol,
          side: "buy",
          amount_usd: Number(amountInRaw) / 1_000_000,
        });
        toast.success(t("purchaseBackgroundComplete", { symbol: purchase.assetSymbol }));
        return true;
      } catch (error) {
        // The bridge leg has already finished. Never recreate or resend it.
        // A failed destination build leaves the delivered USDC available for
        // a normal retry, which cannot duplicate the cross-chain transfer.
        clearPendingRwaSettlement(settlement.requestId);
        await refetchFresh();
        console.error("Background RWA purchase failed", error);
        toast.error(t("purchaseBackgroundFailed", { symbol: purchase.assetSymbol }));
        return true;
      } finally {
        executingRef.current.delete(settlement.requestId);
      }
    };

    const startSaleSettlement = async (
      settlement: (typeof pending)[number]
    ): Promise<"waiting" | "started" | "retry"> => {
      const sale = settlement.sale;
      if (!sale || !solanaTaker || !solanaWalletReady) return "waiting";
      if (executingRef.current.has(settlement.requestId)) return "waiting";

      const payToken = USDC_BY_CHAIN.solana;
      const balance = await fetchConfirmedSolanaBalance(solanaTaker, payToken.address);
      const proceedsRaw = rwaSaleProceedsRaw(
        BigInt(sale.startingUsdcRaw),
        BigInt(sale.minimumProceedsRaw),
        BigInt(sale.expectedProceedsRaw),
        balance
      );
      if (proceedsRaw === 0n) return "waiting";

      executingRef.current.add(settlement.requestId);
      try {
        const result = await settleSolanaToBase({
          asset: payToken.address,
          decimals: payToken.decimals,
          amount: proceedsRaw,
          slippageBps: sale.slippageBps,
        });
        clearPendingRwaSettlement(settlement.requestId);
        savePendingRwaSettlement({
          requestId: result.requestId,
          direction: "solana-to-base",
          assetSymbol: settlement.assetSymbol,
          createdAt: Date.now(),
        });
        await refetchFresh();
        return "started";
      } catch (error) {
        // Quote/provider failures happen before the transfer and are safe to
        // retry. The executor persists the Dextopus request once it broadcasts,
        // so an ambiguous provider submit never causes a second wallet send.
        console.warn("Background RWA sale settlement deferred", error);
        return "retry";
      } finally {
        executingRef.current.delete(settlement.requestId);
      }
    };

    // This is a state-driven reconciler, not a fixed poll. A saved transfer,
    // reconnect, tab activation, provider transition or scheduled backoff is
    // an event that advances the state machine exactly once.
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
              const result = await startSaleSettlement(settlement);
              if (result === "retry") {
                providerFailures += 1;
                nextDelay =
                  PROVIDER_BACKOFF_MS[
                    Math.min(providerFailures - 1, PROVIDER_BACKOFF_MS.length - 1)
                  ];
              }
              continue;
            }

            // Destination chain state is authoritative. If USDC is already in
            // the wallet, finish the purchase even when Dextopus's reporting
            // API is unavailable.
            if (settlement.direction === "base-to-solana" && settlement.purchase) {
              if (await completePurchase(settlement)) continue;
            }

            const status = await fetchDepositStatus(settlement.requestId, "trade");
            if (status.providerUnavailable) {
              providerFailures += 1;
              nextDelay = Math.max(
                status.retryAfterMs ?? 0,
                PROVIDER_BACKOFF_MS[Math.min(providerFailures - 1, PROVIDER_BACKOFF_MS.length - 1)]
              );
              // One unavailable response represents the shared provider. Do
              // not multiply it by every pending settlement in this account.
              break;
            }

            providerFailures = 0;
            const { stage } = depositProgress(status.status, status.executionStatus);
            if (stage === "settled") {
              if (settlement.direction === "solana-to-base") {
                clearPendingRwaSettlement(settlement.requestId);
                await refetchFresh();
                toast.success(t("proceedsBaseBackgroundReady", { symbol: settlement.assetSymbol }));
              } else if (!settlement.purchase) {
                clearPendingRwaSettlement(settlement.requestId);
                await refetchFresh();
                toast.success(t("fundSolanaBackgroundReady", { symbol: settlement.assetSymbol }));
              } else {
                await completePurchase(settlement);
              }
            } else if (stage === "failed" || stage === "refunded") {
              clearPendingRwaSettlement(settlement.requestId);
              toast.error(
                settlement.direction === "base-to-solana"
                  ? t("fundSolanaFailed")
                  : t("proceedsBaseFailed")
              );
            }
          } catch {
            providerFailures += 1;
            nextDelay =
              PROVIDER_BACKOFF_MS[Math.min(providerFailures - 1, PROVIDER_BACKOFF_MS.length - 1)];
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
  }, [
    execute,
    pending,
    refetchFresh,
    refetchUntilChanged,
    settleSolanaToBase,
    solanaTaker,
    solanaWalletReady,
    t,
  ]);

  return null;
}
