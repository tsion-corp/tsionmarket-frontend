// The chains the memecoin trade service executes on, and what the client
// needs to know about each. A token's identity is chainId + address, per the
// service contract; nothing here infers a chain from an address shape.

export const BASE_CHAIN_ID = 8453;
export const SOLANA_CHAIN_ID = 101;

export type MemeChainSlug = "base" | "solana";

interface ChainInfo {
  slug: MemeChainSlug;
  // The portfolio feed's network key, for balances.
  network: "base-mainnet" | "solana-mainnet";
  // The quote currency on both sides of every swap. Case matters on Solana.
  usdc: string;
  // Where a transaction on this chain is looked up, hash appended as written.
  explorerTx: string;
}

const CHAINS: Record<number, ChainInfo> = {
  [BASE_CHAIN_ID]: {
    slug: "base",
    network: "base-mainnet",
    usdc: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    explorerTx: "https://basescan.org/tx/",
  },
  [SOLANA_CHAIN_ID]: {
    slug: "solana",
    network: "solana-mainnet",
    usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    explorerTx: "https://solscan.io/tx/",
  },
};

/** The `?chain=` value the service's detail routes require, or null. */
export function chainSlug(chainId: number): MemeChainSlug | null {
  return CHAINS[chainId]?.slug ?? null;
}

export function isSupportedChain(chainId: number): boolean {
  return chainId in CHAINS;
}

export function networkOf(chainId: number): ChainInfo["network"] | null {
  return CHAINS[chainId]?.network ?? null;
}

export function usdcAddressOf(chainId: number): string | null {
  return CHAINS[chainId]?.usdc ?? null;
}

/** Whether `address` is the quote currency on its chain. EVM addresses
 *  compare case-insensitively; Solana mints are case-sensitive. */
export function isQuoteCurrency(chainId: number, address: string): boolean {
  const usdc = usdcAddressOf(chainId);
  if (!usdc) return false;
  return chainId === SOLANA_CHAIN_ID ? address === usdc : address.toLowerCase() === usdc;
}

/** The trade service's chain id for a portfolio network key, or null. */
export function chainIdOfNetwork(network: string): number | null {
  for (const [chainId, info] of Object.entries(CHAINS)) {
    if (info.network === network) return Number(chainId);
  }
  return null;
}

/**
 * The explorer page for a transaction, or null when there is no hash to point
 * at or the chain is not one this client knows. A Solana signature is
 * case-sensitive and goes into the URL exactly as the service sent it.
 */
export function explorerTxUrl(chainId: number, hash: string | null | undefined): string | null {
  const info = CHAINS[chainId];
  if (!info || !hash) return null;
  return `${info.explorerTx}${encodeURIComponent(hash)}`;
}
