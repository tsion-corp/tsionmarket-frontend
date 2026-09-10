"use client";

import { useCallback, useMemo } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";

const NETWORK = "base-mainnet";
const SCOPE = [NETWORK] as const;

// The game balance is the wallet's ETH on Base. A stake leaves it and a
// payout lands in it as native value, which the portfolio's receipt path
// cannot see, so the caller states the amount: the screen moves at once and
// one read of Base alone, through the server's ZeroDev RPC, confirms it.
// The balance is a node read at "latest", not an indexed figure, so one read
// after the receipt is enough; if it fails the applied figure stays and the
// regular poll corrects it.
export function useGameBalance() {
  const { tokens, refreshing, applyNativeDelta, refetchFresh } = usePortfolio();
  const eth = useMemo(
    () => tokens.find((tk) => tk.network === NETWORK && tk.symbol.toUpperCase() === "ETH"),
    [tokens]
  );

  const settle = useCallback(
    async (deltaWei: bigint) => {
      applyNativeDelta(NETWORK, deltaWei);
      await refetchFresh(SCOPE);
    },
    [applyNativeDelta, refetchFresh]
  );

  return {
    balanceUsd: eth?.valueUsd ?? 0,
    balanceEth: eth?.balance ?? 0,
    holding: eth ?? null,
    refreshing,
    settle,
  };
}
