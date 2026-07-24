// Origin-network helpers for the deposit flow. The live Dextopus catalog is the
// source of truth for which chains/tokens exist; this decides which origins we
// can offer (and refund) and which surface first in the picker.

import type { WalletChainType } from "@/lib/deposit";

// Relay/Dextopus chain ids for the non-EVM chains in the catalog. Everything not
// listed here is EVM. Solana, Eclipse and Soon are all SVM chains that share the
// same address format, so one Solana embedded wallet refunds all three.
const SOLANA_CHAIN_ID = 792703809;
const ECLIPSE_CHAIN_ID = 9286185;
const SOON_CHAIN_ID = 9286186;
const BITCOIN_CHAIN_ID = 8253038;
const TRON_CHAIN_ID = 728126428;

export type OriginFamily = "evm" | "svm" | "bitcoin" | "tron";

export function originFamily(chainId: number): OriginFamily {
  if (chainId === SOLANA_CHAIN_ID || chainId === ECLIPSE_CHAIN_ID || chainId === SOON_CHAIN_ID) {
    return "svm";
  }
  if (chainId === BITCOIN_CHAIN_ID) return "bitcoin";
  if (chainId === TRON_CHAIN_ID) return "tron";
  return "evm";
}

// The embedded-wallet chain type that can refund an origin of this family, or
// null when we hold no wallet on that family and so cannot offer the origin. A
// static deposit address requires a refundTo on the origin's own family, so an
// origin we cannot refund cannot be offered.
export function refundChainType(family: OriginFamily): WalletChainType | null {
  if (family === "evm") return "ethereum";
  if (family === "svm") return "solana";
  return null;
}

// An origin is offerable only when a failed deposit can be refunded, i.e. its
// family maps to one of our embedded wallets. Bitcoin and Tron are gated out
// until a default refund address is configured in the Dextopus dashboard.
export function isSupportedOrigin(chainId: number): boolean {
  return refundChainType(originFamily(chainId)) !== null;
}

// Dextopus chain ids for the networks we promote to the front of the picker
// (the ones users most often hold). Gated-out families are omitted.
export const POPULAR_CHAIN_IDS: readonly number[] = [
  1, // Ethereum
  8453, // Base
  42161, // Arbitrum
  792703809, // Solana
  137, // Polygon
  10, // Optimism
  56, // BNB Chain
  43114, // Avalanche
  59144, // Linea
  81457, // Blast
];

// Popular networks first (in the order above), then everything else by name.
export function orderChains<T extends { chainId: number; name: string }>(
  chains: readonly T[]
): T[] {
  const rank = new Map(POPULAR_CHAIN_IDS.map((id, i) => [id, i]));
  return [...chains].sort((a, b) => {
    const ra = rank.get(a.chainId) ?? Number.POSITIVE_INFINITY;
    const rb = rank.get(b.chainId) ?? Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}
