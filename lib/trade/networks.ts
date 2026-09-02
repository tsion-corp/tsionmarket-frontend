// Display name and native gas token for every network we hold balances on.
//
// One map, because two features need it: the spot panel and the sell sheet each
// kept their own copy covering five chains, so a holding on any other chain
// rendered its raw network id and, worse, matched no native symbol at all. The
// keys track EVM_CHAIN_ID in hooks/use-withdraw.ts.
export interface NetworkMeta {
  label: string;
  nativeSymbol: string;
}

const NETWORK_META: Record<string, NetworkMeta> = {
  "base-mainnet": { label: "Base", nativeSymbol: "ETH" },
  "eth-mainnet": { label: "Ethereum", nativeSymbol: "ETH" },
  "arb-mainnet": { label: "Arbitrum", nativeSymbol: "ETH" },
  "opt-mainnet": { label: "Optimism", nativeSymbol: "ETH" },
  "polygon-mainnet": { label: "Polygon", nativeSymbol: "POL" },
  "solana-mainnet": { label: "Solana", nativeSymbol: "SOL" },
  "apechain-mainnet": { label: "ApeChain", nativeSymbol: "APE" },
  "berachain-mainnet": { label: "Berachain", nativeSymbol: "BERA" },
  "bnb-mainnet": { label: "BNB Chain", nativeSymbol: "BNB" },
  "celo-mainnet": { label: "Celo", nativeSymbol: "CELO" },
  "gensyn-mainnet": { label: "Gensyn", nativeSymbol: "GEN" },
  "hyperliquid-mainnet": { label: "HyperEVM", nativeSymbol: "HYPE" },
  "ink-mainnet": { label: "Ink", nativeSymbol: "ETH" },
  "monad-mainnet": { label: "Monad", nativeSymbol: "MON" },
  "robinhood-mainnet": { label: "Robinhood Chain", nativeSymbol: "ETH" },
  "shape-mainnet": { label: "Shape", nativeSymbol: "ETH" },
  "soneium-mainnet": { label: "Soneium", nativeSymbol: "ETH" },
  "unichain-mainnet": { label: "Unichain", nativeSymbol: "ETH" },
  "worldchain-mainnet": { label: "World Chain", nativeSymbol: "ETH" },
  "gnosis-mainnet": { label: "Gnosis", nativeSymbol: "XDAI" },
  "linea-mainnet": { label: "Linea", nativeSymbol: "ETH" },
  "zksync-mainnet": { label: "zkSync", nativeSymbol: "ETH" },
  "scroll-mainnet": { label: "Scroll", nativeSymbol: "ETH" },
  "avax-mainnet": { label: "Avalanche", nativeSymbol: "AVAX" },
  "blast-mainnet": { label: "Blast", nativeSymbol: "ETH" },
  "zora-mainnet": { label: "Zora", nativeSymbol: "ETH" },
  "ronin-mainnet": { label: "Ronin", nativeSymbol: "RON" },
  "abstract-mainnet": { label: "Abstract", nativeSymbol: "ETH" },
  "mythos-mainnet": { label: "Mythos", nativeSymbol: "MYTH" },
};

// Falls back to the raw network id, which is ugly but true, rather than an
// invented name.
export function networkLabel(network: string): string {
  return NETWORK_META[network]?.label ?? network;
}

// Null for a chain we have not recorded, which callers must treat as "unknown",
// never as "no native token". A gas check that cannot name the gas token cannot
// conclude the wallet is short of it, and blocking a sale on that guess is how
// a user holding plenty of HYPE was told to top up.
export function nativeSymbol(network: string): string | null {
  return NETWORK_META[network]?.nativeSymbol ?? null;
}
