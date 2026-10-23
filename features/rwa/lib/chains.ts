import type { RwaChain } from "@/lib/rwa/catalog";

// EVM chain ids per RWA chain. Without an explicit chainId, Privy defaults to
// Ethereum mainnet (1), so a non-Ethereum RWA buy would be signed on the wrong
// chain and fail with "insufficient funds for gas".
export const RWA_EVM_CHAIN_ID: Partial<Record<RwaChain, number>> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  bsc: 56,
  polygon: 137,
};
