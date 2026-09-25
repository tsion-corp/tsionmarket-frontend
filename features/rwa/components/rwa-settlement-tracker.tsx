"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useExecuteRwa } from "@/features/rwa/hooks/use-execute-rwa";
import { buildRwaAction, USDC_BY_CHAIN } from "@/features/rwa/lib/api";
import { rwaShineEvent } from "@/features/rwa/lib/shine";
import { reportShine } from "@/lib/shine";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSettlementReconciler } from "@/hooks/use-settlement-reconciler";
import { track } from "@/lib/analytics/mixpanel";
import { tradeAmounts } from "@/lib/analytics/trade-amounts";
import { toast } from "@/lib/toast";
import {
  clearPendingRwaSettlement,
  rwaPurchaseSpendRaw,
  type PendingRwaSettlement,
} from "@/lib/trade/pending-settlement";

// A settlement moves USD off Base and buys on Solana: both sides changed.
const CROSS_CHAIN = ["base-mainnet", "solana-mainnet"] as const;

// Mounted at dashboard scope, not in the trade sheet. It owns both the
// post-sale Dextopus handoff and provider reconciliation, so closing the sheet
// or reloading cannot strand confirmed sale proceeds on Solana. The loop is
// shared with the memecoin tracker; what is real-asset-specific is here: how a
// funded purchase is built and executed, and what the user is told.
export function RwaSettlementTracker() {
  const t = useTranslations("rwa");
  const execute = useExecuteRwa();
  const { refetchFresh, refetchUntilChanged } = usePortfolio();

  const completePurchase = useCallback(
    async (
      settlement: PendingRwaSettlement,
      { solanaTaker, balance }: { solanaTaker: string; balance: bigint }
    ) => {
      const purchase = settlement.purchase;
      if (!purchase) return false;
      const payToken = USDC_BY_CHAIN.solana;
      const requestedRaw = BigInt(purchase.amountInRaw);
      const amountInRaw =
        purchase.startingUsdcRaw === undefined
          ? requestedRaw < balance
            ? requestedRaw
            : balance
          : rwaPurchaseSpendRaw(requestedRaw, BigInt(purchase.startingUsdcRaw), balance);
      const minimumDeliveryRaw = BigInt(purchase.minimumDeliveryRaw ?? "1");
      if (amountInRaw < minimumDeliveryRaw) return false;

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
        // The purchase is confirmed here, not in the ticket: the ticket only
        // funded it, and may have been closed or reloaded away since. Solana
        // signatures are polled to confirmation, so this await is a real one.
        //
        // Keyed by the settlement request id, which was written to storage
        // before the bridge leg ran and is therefore the same id after the
        // reload this worker exists to survive. The asset's decimals are not
        // in the pending record, so the price per unit cannot be recovered
        // here: the post states the buy and no figure.
        const shineEvent = rwaShineEvent({
          id: settlement.requestId,
          symbol: purchase.assetSymbol,
          chain: "solana",
          side: "buy",
          price: null,
          stepCount: action.steps.length,
        });
        if (shineEvent) reportShine(shineEvent);
        clearPendingRwaSettlement(settlement.requestId);
        await refetchFresh(CROSS_CHAIN);
        void refetchUntilChanged(CROSS_CHAIN);
        // The USDC this leg spent, exactly: it is the build's own input.
        track("trade_completed", {
          vertical: "rwa",
          asset: purchase.assetSymbol,
          side: "buy",
          ...tradeAmounts({
            usdRaw: amountInRaw,
            usdDecimals: payToken.decimals,
            tokenRaw: null,
            tokenDecimals: null,
            source: "fill",
          }),
          order_id: settlement.requestId,
          token_address: purchase.assetAddress,
        });
        toast.success(t("purchaseBackgroundComplete", { symbol: purchase.assetSymbol }));
      } catch (error) {
        // The bridge leg has already finished. Never recreate or resend it.
        // A failed destination build leaves the delivered USDC available for
        // a normal retry, which cannot duplicate the cross-chain transfer.
        clearPendingRwaSettlement(settlement.requestId);
        await refetchFresh(CROSS_CHAIN);
        console.error("Background RWA purchase failed", error);
        toast.error(t("purchaseBackgroundFailed", { symbol: purchase.assetSymbol }));
      }
      return true;
    },
    [execute, refetchFresh, refetchUntilChanged, t]
  );

  const messages = useMemo(
    () => ({
      fundReady: (symbol: string) => t("fundSolanaBackgroundReady", { symbol }),
      fundFailed: () => t("fundSolanaFailed"),
      proceedsReady: (symbol: string) => t("proceedsBaseBackgroundReady", { symbol }),
      proceedsFailed: () => t("proceedsBaseFailed"),
    }),
    [t]
  );

  useSettlementReconciler({ product: "rwa", completePurchase, messages });
  return null;
}
