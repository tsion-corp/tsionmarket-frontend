"use client";
import { useAuthSession } from "@/hooks/use-auth-session";

import { useMemo } from "react";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useMoney } from "@/components/ui/currency-select";

import { weiToUnits } from "@/features/casino/lib/money";

// The casino spends the same balance as the rest of the platform: the
// player's own Base holding, presented in whatever currency they have
// selected. There is no separate casino wallet or float, so a deposit made on
// the dashboard is immediately playable and winnings show up in the same
// balance everywhere.
export function useCasinoWallet() {
  const { ready, authenticated, evmAddress, solanaAddress, profile } = useAuthSession();
  const addressFor = (chain: string) => (chain === "solana" ? solanaAddress : evmAddress);
  const money = useMoney();
  const { tokens, loading, refetch } = usePortfolio({ scope: "base" });

  const address = evmAddress;

  const holding = useMemo(
    () => tokens.find((t) => t.network === "base-mainnet" && t.symbol.toUpperCase() === "ETH"),
    [tokens]
  );

  const balance = holding?.balance ?? 0;
  const balanceUsd = holding?.valueUsd ?? 0;
  // Unit price derived from the holding itself, so it always agrees with the
  // figure the dashboard shows rather than a separately fetched quote.
  const unitPriceUsd = balance > 0 ? balanceUsd / balance : 0;

  // Whether a stake is affordable, compared in exact units rather than
  // dollars so a price blip can never let an unaffordable stake through.
  const canAfford = (stakeWei: string | bigint): boolean => {
    try {
      const wei = typeof stakeWei === "bigint" ? stakeWei.toString() : stakeWei;
      return balance >= weiToUnits(wei);
    } catch {
      return false;
    }
  };

  return {
    address,
    name: profile.name,
    connected: !!address,
    balance,
    balanceUsd,
    unitPriceUsd,
    isLoading: loading,
    canAfford,
    refetch,
    // Formats a dollar figure in the user's selected currency, the same way
    // every other balance in the app is rendered.
    format: money.format,
  };
}
