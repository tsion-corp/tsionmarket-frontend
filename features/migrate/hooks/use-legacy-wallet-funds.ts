"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { Portfolio } from "@/lib/server/alchemy";
import { walletHoldings } from "@/features/migrate/lib/venues/wallet";
import {
  legacyWalletHasFunds,
  legacyWalletUsd,
  legacyWalletWorthMoving,
} from "@/features/migrate/lib/legacy-funds";

interface Addresses {
  evm: string | null;
  solana: string | null;
}

export interface LegacyWalletFunds {
  /** Anything sweepable is still there, whatever it is worth. */
  hasFunds: boolean;
  /**
   * Something sweepable worth at least a cent is still there — the bar for
   * re-offering a linked account. $0.00 is nothing. See legacyWalletWorthMoving.
   */
  worthMoving: boolean;
  /** Display total of what could move. */
  usd: number;
}

/**
 * The old wallet's balance, read by the frontend: what is left to move and
 * what it is worth, or null for "could not tell" (a partial read is a floor,
 * not an answer). Same read the wallet venue's discovery makes, so the offer,
 * the figure on the badge and the sweep can never disagree about what is
 * there.
 *
 * Only for a linked account — before the link, the old addresses are not
 * known here, and the offer is about linking rather than money anyway.
 */
export function useLegacyWalletFunds(legacy: Addresses | null, enabled: boolean) {
  const evm = legacy?.evm ?? null;
  const solana = legacy?.solana ?? null;
  return useQuery<LegacyWalletFunds | null>({
    queryKey: ["legacyWalletFunds", evm, solana],
    enabled: enabled && (evm !== null || solana !== null),
    staleTime: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (evm) params.set("evm", evm);
      if (solana) params.set("solana", solana);
      // fresh=1 skips the shared server cache: money that moved seconds ago
      // must not still count as left.
      params.set("fresh", "1");
      // The whole old wallet, not just the contracts on the live portfolio's
      // allowlist — a held token the ranked catalogue never reached must still
      // be seen here, or it is never moved.
      params.set("scope", "legacy");
      const res = await apiFetch(`/api/portfolio?${params.toString()}`, {}, { requireAuth: true });
      if (!res.ok) throw new Error("Couldn't check your old account.");
      const portfolio = (await res.json()) as Portfolio;
      if (portfolio.missing?.length) return null;
      const holdings = walletHoldings(portfolio.tokens);
      return {
        hasFunds: legacyWalletHasFunds(holdings),
        worthMoving: legacyWalletWorthMoving(holdings),
        usd: legacyWalletUsd(holdings),
      };
    },
  });
}
