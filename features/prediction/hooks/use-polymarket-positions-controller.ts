"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMoney } from "@/components/ui/currency-select";
import {
  usePolymarketPositions,
  type PolymarketPosition,
} from "@/features/prediction/hooks/use-polymarket-positions";
import {
  CashoutError,
  usePolymarketCashout,
} from "@/features/prediction/hooks/use-polymarket-cashout";
import { useClaimedOnce } from "@/features/prediction/hooks/use-claimed-once";
import { usePolymarketRedeem } from "@/features/prediction/hooks/use-polymarket-redeem";
import { SettleError, useSettleToBase } from "@/features/prediction/hooks/use-settle";
import { toast } from "@/lib/toast";
import type { RawPosition } from "@/features/prediction/lib/positions";

// The Polymarket positions flow, lifted out of prediction-view.tsx so the
// desktop page and the phone Market tab drive the same money paths rather than
// each keeping its own copy of claim, sell and cash-out. Nothing here renders:
// it owns the state and the three handlers, and hands them back for a panel to
// display. See PredictionPositions for that panel.
export interface PolymarketPositionsController {
  positions: ReturnType<typeof usePolymarketPositions>;
  slip: PolymarketPosition | null;
  setSlip: (position: PolymarketPosition | null) => void;
  onRedeem: (conditionId: string) => Promise<void>;
  onSellPosition: (position: RawPosition) => Promise<void>;
  onCashOut: () => Promise<void>;
  redeemingId: string | null;
  /** A claim or its settlement is in flight. */
  claiming: boolean;
  /** A position sale is in flight. */
  selling: boolean;
  /** A cash-out (settle to Base) is in flight. */
  cashingOut: boolean;
  /** Conditions claimed this session, so the panel can retire their buttons. */
  claimedConditionIds: string[];
}

export function usePolymarketPositionsController(): PolymarketPositionsController {
  const t = useTranslations("prediction");
  const money = useMoney();
  const [slip, setSlip] = useState<PolymarketPosition | null>(null);
  const positions = usePolymarketPositions();
  const redeem = usePolymarketRedeem();
  const cashout = usePolymarketCashout();
  // Conditions redeemed this session, so the list can retire their Claim
  // buttons before the indexed positions feed catches up.
  const { hasClaimed, markClaimed } = useClaimedOnce();
  const settle = useSettleToBase();

  const onRedeem = async (conditionId: string) => {
    const toastId = toast.loading(t("toastClaiming"));
    // 1) Claim: convert the winning shares to pUSD in the prediction account.
    try {
      await redeem.redeem(conditionId);
      // Retire this position's Claim button immediately. The positions feed is
      // indexed and still reports it as redeemable for a while, which used to
      // re-arm the button on winnings that were already paid out.
      markClaimed(conditionId);
    } catch {
      toast.error(redeem.error ?? t("toastClaimFailed"), { id: toastId });
      return;
    }
    // 2) Move the winnings out to USDC on Base. If this leg fails, the claim
    // still succeeded and the funds are safe as pUSD, recoverable via Cash out.
    try {
      await settle.settleToBase();
      toast.success(t("toastClaimSuccess"), { id: toastId });
    } catch {
      toast.error(t("toastClaimSettleFailed"), {
        id: toastId,
      });
    }
    setSlip(null);
    positions.refresh();
  };

  // Sells an open position back into the market before resolution. Proceeds
  // land as pUSD in the prediction balance, where the existing cash-out flow
  // can move them to Base.
  const onSellPosition = async (position: RawPosition) => {
    const tokenId = position.tokenId ?? null;
    const shares = Number(position.size ?? 0);
    if (!tokenId || !(shares > 0)) return;
    const toastId = toast.loading(t("toastSellingPosition"));
    try {
      const result = await cashout.cashOut({ tokenId, shares });
      if (result.settlementPending) {
        toast.success(t("toastSoldPosition", { amount: money.formatExact(result.proceedsUsd) }), {
          id: toastId,
          sensitive: true,
        });
      } else {
        try {
          await settle.settleToBase();
          toast.success(t("toastCashOutSuccess"), { id: toastId, sensitive: true });
        } catch {
          // The CLOB sale already succeeded. Keep that outcome explicit so a
          // failed bridge never invites the user to sell the position twice.
          toast.error(t("toastClaimSettleFailed"), { id: toastId });
        }
      }
      setSlip(null);
      positions.refresh();
    } catch (e) {
      // The reason comes off the thrown error, not cashout.error: this catch
      // runs before the hook's state update has re-rendered, so reading state
      // here would always show the generic fallback.
      toast.error(e instanceof CashoutError ? e.message : t("toastSellFailed"), { id: toastId });
    }
  };

  const onCashOut = async () => {
    if (positions.cashable == null || positions.cashable <= 0) return;
    const toastId = toast.loading(t("toastCashingOut"));
    try {
      await settle.settleToBase();
      toast.success(t("toastCashOutSuccess"), { id: toastId });
      positions.refresh();
    } catch (e) {
      toast.error(e instanceof SettleError ? e.message : t("toastCashOutFailed"), { id: toastId });
    }
  };

  const claimedConditionIds = positions.positions
    .map((p) => (p as { conditionId?: string }).conditionId)
    .filter((id): id is string => !!id && hasClaimed(id));

  return {
    positions,
    slip,
    setSlip,
    onRedeem,
    onSellPosition,
    onCashOut,
    redeemingId: redeem.redeeming,
    claiming: redeem.redeeming != null || settle.phase !== "idle",
    selling: cashout.phase !== "idle",
    cashingOut: settle.phase !== "idle",
    claimedConditionIds,
  };
}
