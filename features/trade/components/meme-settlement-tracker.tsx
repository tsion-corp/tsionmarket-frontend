"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useMemeTrade } from "@/features/trade/hooks/use-meme-trade";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useSettlementReconciler } from "@/hooks/use-settlement-reconciler";
import { track } from "@/lib/analytics/mixpanel";
import { amountFromBaseUnits, tradeAmounts, USDC_DECIMALS } from "@/lib/analytics/trade-amounts";
import { TRADE_FAILURE, reasonFor } from "@/lib/analytics/failure-reason";
import { swapTradeFacts } from "@/features/trade/lib/trade-analytics";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import { usdcFromRaw } from "@/lib/meme/funding";
import { toast } from "@/lib/toast";
import {
  clearPendingRwaSettlement,
  rwaPurchaseSpendRaw,
  type PendingRwaSettlement,
} from "@/lib/trade/pending-settlement";

// A settlement moves USD off Base and buys on Solana: both sides changed.
const CROSS_CHAIN = ["base-mainnet", "solana-mainnet"] as const;

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
        const result = await trade({
          side: "BUY",
          tokenAddress: purchase.assetAddress,
          amount: usdcFromRaw(spendRaw),
          chainId: SOLANA_CHAIN_ID,
          // The second leg of an order the user placed, so it is their trade
          // and it shines like one. The ticker is the one recorded when the
          // first leg was saved; the Solana quote names none.
          tokenSymbol: purchase.assetSymbol,
        });
        clearPendingRwaSettlement(settlement.requestId);
        await refetchFresh(CROSS_CHAIN);
        void refetchUntilChanged(CROSS_CHAIN);
        // What this leg spent is exact: the USDC that arrived, capped at the
        // amount asked for. A Solana quote states no amounts of its own.
        const spent = tradeAmounts({
          usdRaw: spendRaw,
          usdDecimals: USDC_DECIMALS,
          tokenRaw: null,
          tokenDecimals: null,
          source: "fill",
        });
        const facts = swapTradeFacts(result, spent);
        if (facts) {
          track("trade_completed", {
            vertical: "memecoin",
            asset: purchase.assetSymbol,
            side: "buy",
            ...facts,
            network: "solana",
            token_address: purchase.assetAddress,
          });
        }
        toast.success(t("purchaseBackgroundComplete", { symbol: purchase.assetSymbol }));
      } catch (error) {
        // The move has already finished. Never recreate or resend it. The USD
        // is in the Solana wallet and a normal retry from the sheet spends it
        // without moving anything again.
        clearPendingRwaSettlement(settlement.requestId);
        await refetchFresh(CROSS_CHAIN);
        console.error("Background memecoin purchase failed", error);
        track("trade_failed", {
          vertical: "memecoin",
          asset: purchase.assetSymbol,
          side: "buy",
          ...reasonFor(TRADE_FAILURE, error),
          amount_usd: amountFromBaseUnits(spendRaw, USDC_DECIMALS),
          order_id: settlement.requestId,
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
