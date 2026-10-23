import { NETWORK_TO_CHAIN } from "@/lib/sell";

// The trade flows only know the numeric chain id, so this inverts the table
// rather than keeping a second copy of it: two lists of chains drift.
const CHAIN_TO_NETWORK: Record<number, string> = Object.fromEntries(
  Object.entries(NETWORK_TO_CHAIN).map(([network, chainId]) => [chainId, network])
);

export function networkForChainId(chainId: number): string | null {
  return CHAIN_TO_NETWORK[chainId] ?? null;
}
