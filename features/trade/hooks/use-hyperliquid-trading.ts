"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useHyperliquidWallet } from "@/features/trade/hooks/use-hyperliquid-wallet";
import {
  useHyperliquidAssets,
  useHyperliquidClearinghouse,
  useHyperliquidPrices,
} from "@/features/trade/hooks/use-hyperliquid-markets";
import { useHyperliquidPositions } from "@/features/trade/hooks/use-hyperliquid-positions";
import { useHyperliquidOrders } from "@/features/trade/hooks/use-hyperliquid-orders";
import { useHyperliquidActions } from "@/features/trade/lib/hyperliquid-actions";
import { isRestingOrder } from "@/features/trade/lib/hyperliquid-types";
import { perpsBalanceQueryKey } from "@/hooks/use-global-balance";

// Everything both the simple and pro Hyperliquid views need: wallet identity,
// funding, market data, positions/orders, and the write actions — one call
// instead of each view independently wiring the same eight hooks.
export function useHyperliquidTrading() {
  const { authenticated } = usePrivy();
  const queryClient = useQueryClient();
  const { walletId, address, loading: walletLoading, error: walletError } = useHyperliquidWallet();
  const { assets, loading: assetsLoading } = useHyperliquidAssets();
  const { prices } = useHyperliquidPrices(authenticated);
  const {
    state: clearinghouse,
    loading: clearinghouseLoading,
    refetch: refetchClearinghouse,
  } = useHyperliquidClearinghouse(address, authenticated);
  // Orders first: whether one is resting decides whether positions keep
  // polling before a position exists.
  const {
    orders,
    loading: ordersLoading,
    refetch: refetchOrders,
    waitForChange: waitForOrdersChange,
  } = useHyperliquidOrders(walletId, authenticated);
  const {
    positions,
    loading: positionsLoading,
    refetch: refetchPositions,
    waitForChange: waitForPositionsChange,
  } = useHyperliquidPositions(walletId, authenticated, orders.some(isRestingOrder));
  const actions = useHyperliquidActions(walletId ?? undefined, address ?? undefined);

  // One check per wallet, on load — not a running poll. Picks up a
  // withdrawal that landed on Arbitrum but never made it on to Base (see
  // resumeWithdrawal on the actions hook); a no-op for everyone else.
  const resumedWalletRef = useRef<string | null>(null);
  useEffect(() => {
    if (!walletId || resumedWalletRef.current === walletId) return;
    resumedWalletRef.current = walletId;
    void actions.resumeWithdrawal();
    // actions is recreated every render (useHyperliquidActions isn't memoized
    // as a whole) — depending on walletId alone is what keeps this to one
    // call per wallet instead of one per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletId]);

  // A trade opening or closing moves margin, positions and orders at once, so
  // refetchAll refreshes all three. A narrower action refreshes only what it
  // changed (llms.txt §10): a cancel or trigger edit the orders, a top-up or
  // withdrawal the clearinghouse balance.
  // The perps balance on the balance card (useGlobalBalance) is not polled,
  // so whatever moves perps money refreshes it here too.
  const refreshBalances = () => {
    void refetchClearinghouse();
    void queryClient.invalidateQueries({ queryKey: perpsBalanceQueryKey() });
  };

  const refetchAll = () => {
    refreshBalances();
    void refetchPositions();
    void refetchOrders();
  };

  return {
    authenticated,
    walletId,
    address,
    walletLoading,
    walletError,
    assets,
    assetsLoading,
    prices,
    clearinghouse,
    clearinghouseLoading,
    positions,
    positionsLoading,
    orders,
    ordersLoading,
    actions,
    refetchAll,
    refreshBalances,
    refetchClearinghouse,
    refetchPositions,
    refetchOrders,
    waitForPositionsChange,
    waitForOrdersChange,
  };
}
