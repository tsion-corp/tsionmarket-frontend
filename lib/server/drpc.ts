import "server-only";

// dRPC is the plain JSON-RPC provider for every chain read the server makes
// (EVM via lib/server/evm-read.ts, Solana via lib/server/solana-rpc-upstreams.ts).
// Alchemy keeps only what dRPC has no API for: token prices, token metadata,
// asset-transfer history and the gas-sponsorship bundler.
//
// The key comes from DRPC_API_KEY (server-only, never NEXT_PUBLIC_), the same
// credential worldstreet-crypto-backend uses. It is read at call time, so a
// test can stub it and a changed key needs no rebuild. Without it every dRPC
// read reports "no read provider" rather than falling back silently.
export function drpcApiKey(): string | null {
  const key = process.env.DRPC_API_KEY?.trim();
  return key ? key : null;
}

const DRPC_BASE = "https://lb.drpc.live";

// Our network ids (Alchemy-style, used across the app) to dRPC's network
// paths. Every entry was verified live with eth_chainId on 2026-11-24.
// Networks dRPC does not serve (shape, gensyn, polynomial, stable-testnet)
// are absent on purpose: drpcUrl returns null and the caller says so.
export const DRPC_NETWORKS: Readonly<Record<string, string>> = {
  "eth-mainnet": "ethereum",
  "eth-sepolia": "sepolia",
  "base-mainnet": "base",
  "base-sepolia": "base-sepolia",
  "arb-mainnet": "arbitrum",
  "arb-sepolia": "arbitrum-sepolia",
  "arbnova-mainnet": "arbitrum-nova",
  "apechain-mainnet": "apechain",
  "apechain-curtis": "apechain-curtis",
  "berachain-mainnet": "berachain",
  "bnb-mainnet": "bsc",
  "bnb-testnet": "bsc-testnet",
  "celo-mainnet": "celo",
  "celo-sepolia": "celo-sepolia",
  "cronos-mainnet": "cronos",
  "cronos-testnet": "cronos-testnet",
  "edge-mainnet": "edge",
  "frax-mainnet": "fraxtal",
  "hyperliquid-mainnet": "hyperliquid",
  "hyperliquid-testnet": "hyperliquid-testnet",
  "ink-mainnet": "ink",
  "ink-sepolia": "ink-sepolia",
  "monad-mainnet": "monad-mainnet",
  "monad-testnet": "monad-testnet",
  "opbnb-mainnet": "opbnb",
  "opbnb-testnet": "opbnb-testnet",
  "opt-mainnet": "optimism",
  "opt-sepolia": "optimism-sepolia",
  "plasma-mainnet": "plasma",
  "plasma-testnet": "plasma-testnet",
  "polygon-mainnet": "polygon",
  "polygon-amoy": "polygon-amoy",
  "robinhood-mainnet": "robinhood",
  "soneium-mainnet": "soneium",
  "soneium-minato": "soneium-minato",
  "stable-mainnet": "stable",
  "unichain-mainnet": "unichain",
  "unichain-sepolia": "unichain-sepolia",
  "worldchain-mainnet": "worldchain",
  "worldchain-sepolia": "worldchain-sepolia",
  "solana-mainnet": "solana",
};

/**
 * The dRPC JSON-RPC endpoint for one of our network ids, or null when dRPC
 * does not serve that network or DRPC_API_KEY is not set.
 */
export function drpcUrl(network: string): string | null {
  const path = DRPC_NETWORKS[network];
  const key = drpcApiKey();
  return path && key ? `${DRPC_BASE}/${path}/${key}` : null;
}
