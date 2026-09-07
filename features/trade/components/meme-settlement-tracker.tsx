"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useMemeTrade } from "@/features/trade/hooks/use-meme-trade";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSettlementReconciler } from "@/hooks/use-settlement-reconciler";
import { track } from "@/lib/analytics/mixpanel";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import { usdcFromRaw } from "@/lib/meme/funding";
import { toast } from "@/lib/toast";
import {
  clearPendingRwaSettlement,
  rwaPurchaseSpendRaw,
  type PendingRwaSettlement,
} from "@/lib/trade/pending-settlement";

// Mounted at dashboard scope, not in the trade sheet. A Solana memecoin bought
// from the user's Base USD is a two-leg order: the USDC moves first, then the
// coin is bought with what arrived. This finishes the second leg once the
// first has landed, and routes the USDC from a Solana sale back to Base, so a
// closed sheet or a reload never strands money on Solana.
export function MemeSettlementTracker() {
  const t = useTranslations("meme");
  const { trade } = useMemeTrade();
  const { refetchFresh, refetchUntilChanged } = usePortfolio();

  const completePurchase = useCallback(
    async (settlement: PendingRwaSettlement, { balance }: { balance: bigint }) => {
      const purchase = settlement.purchase;
      if (!purchase) return false;
      const requestedRaw = BigInt(purchase.amountInRaw);
      const spendRaw =
        purchase.startingUsdcRaw === undefined
          ? requestedRaw < balance
            ? requestedRaw
            : balance
          : rwaPurchaseSpendRaw(requestedRaw, BigInt(purchase.startingUsdcRaw), balance);
      const minimumDeliveryRaw = BigInt(purchase.minimumDeliveryRaw ?? "1");
      if (spendRaw < minimumDeliveryRaw) return false;

      try {
        await trade({
          side: "BUY",
          tokenAddress: purchase.assetAddress,
          amount: usdcFromRaw(spendRaw),
          chainId: SOLANA_CHAIN_ID,
        });
        clearPendingRwaSettlement(settlement.requestId);
        await refetchFresh();
        void refetchUntilChanged();
        track("trade_completed", {
          vertical: "memecoin",
          token: purchase.assetSymbol,
          side: "buy",
          amount_usd: Number(spendRaw) / 1_000_000,
          network: "solana",
        });
        toast.success(t("purchaseBackgroundComplete", { symbol: purchase.assetSymbol }));
      } catch (error) {
        // The move has already finished. Never recreate or resend it. The USD
        // is in the Solana wallet and a normal retry from the sheet spends it
        // without moving anything again.
        clearPendingRwaSettlement(settlement.requestId);
        await refetchFresh();
        console.error("Background memecoin purchase failed", error);
        track("trade_failed", {
          vertical: "memecoin",
          asset: purchase.assetSymbol,
          reason: "background_purchase_failed",
        });
        toast.error(t("purchaseBackgroundFailed", { symbol: purchase.assetSymbol }));
      }
      return true;
    },
    [trade, refetchFresh, refetchUntilChanged, t]
  );

  const messages = useMemo(
    () => ({
      fundReady: (symbol: string) => t("fundReady", { symbol }),
      fundFailed: () => t("fundFailed"),
      proceedsReady: (symbol: string) => t("proceedsReady", { symbol }),
      proceedsFailed: () => t("proceedsFailed"),
    }),
    [t]
  );

  useSettlementReconciler({ product: "meme", completePurchase, messages });
  return null;
}
