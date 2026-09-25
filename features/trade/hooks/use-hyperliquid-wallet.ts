"use client";
import { useAuthSession } from "@/hooks/use-auth-session";

import { useQuery } from "@tanstack/react-query";
import { getOrCreateWallet } from "@/features/trade/lib/hyperliquid-api";

// Resolves the internal walletId every Hyperliquid prepare/submit call needs,
// for the signed-in user's embedded EVM wallet. Get-or-create is idempotent
// server-side, so this can run on every mount without creating duplicates.
export function useHyperliquidWallet() {
  const { ready, authenticated, evmAddress, solanaAddress, profile } = useAuthSession();
  const addressFor = (chain: string) => (chain === "solana" ? solanaAddress : evmAddress);
  const address = evmAddress;

  const query = useQuery({
    queryKey: ["hl-wallet", address],
    queryFn: () => getOrCreateWallet(address as string),
    enabled: authenticated && address != null,
    staleTime: 5 * 60_000,
  });

  return {
    wallet: query.data ?? null,
    walletId: query.data?.id ?? null,
    address,
    loading: query.isLoading,
    error: query.isError ? query.error : null,
  };
}
