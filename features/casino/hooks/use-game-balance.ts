"use client";

import { useCallback, useMemo } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { GAME_ASSET } from "@/features/casino/lib/last-standing/stake";

const NETWORK = "base-mainnet";
const SCOPE = [NETWORK] as const;

// What the player can stake: their USDC on Base, which from v5 on is the asset
// the game is played in and the same balance the rest of the app spends.
//
// It used to read the wallet's ETH, because a v4 stake was native value. Left
// that way against a USDC game it compares two different currencies: a funded
// player's stake button reads "Not enough ETH" while their dollars sit there.
//
// A stake leaves this balance and a payout lands in it, and the portfolio's own
// receipt path cannot see either, so the caller states the amount: the screen
// moves at once and one read of Base confirms it. If that read fails the
// applied figure stays and the regular poll corrects it.
export function useGameBalance() {
  const { tokens, refreshing, refetchFresh } = usePortfolio({ scope: "base" });
  const usdc = useMemo(
    () =>
      tokens.find(
        (token) =>
          token.network === NETWORK &&
          token.address?.toLowerCase() === GAME_ASSET.address.toLowerCase()
      ),
    [tokens]
  );

  // The optimistic step is deliberately dropped rather than reimplemented for a
  // token: applyNativeDelta moves the NATIVE row, so calling it here would
  // credit the player's ETH for a USDC stake and show money that is not there.
  // A scoped fresh read is one call and tells the truth.
  const settle = useCallback(async () => {
    await refetchFresh(SCOPE);
  }, [refetchFresh]);

  return {
    /** The stakeable balance in dollars. USDC is dollars, so this is also the amount. */
    balanceUsd: usdc?.valueUsd ?? 0,
    balanceUnits: usdc ? BigInt(usdc.rawBalance) : 0n,
    holding: usdc ?? null,
    refreshing,
    settle,
  };
}
