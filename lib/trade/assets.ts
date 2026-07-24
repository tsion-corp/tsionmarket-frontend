// Registry of assets tradable on the unified Trade surface, organised by the
// four networks we support: Solana (routed via Jupiter) and the EVM chains Base,
// Arbitrum and Polygon (routed via LI.FI). Each network lists the native gas
// token plus USDC (and a couple of majors on the deepest chains). A swap always
// stays on one network — same-chain, no bridge.

import { NATIVE_TOKEN_ADDRESS } from "@/lib/trade/erc20";

export interface TradeAsset {
  symbol: string;
  name: string;
  bg: string;
  // Solana SPL mint. Present only for assets routed on-chain via Jupiter.
  mint?: string;
  decimals?: number;
  // EVM routing via LI.FI. Present only for assets with an EVM token. The
  // native gas token uses the aggregator native sentinel so no approval is
  // needed and the user spends the native balance they already hold.
  evmChainId?: number;
  evmAddress?: string;
  evmDecimals?: number;
}

export type SwapChainKey = "solana" | "base" | "arbitrum" | "polygon";

export interface SwapNetwork {
  key: SwapChainKey;
  name: string;
  kind: "solana" | "evm";
  // Present for EVM networks; the chain id LI.FI and the wallet sign against.
  evmChainId?: number;
  // Alchemy portfolio network id, so balances and the gas check read the right
  // chain.
  alchemyNetwork: string;
  nativeSymbol: string;
}

export const BASE_CHAIN_ID = 8453;
export const ARBITRUM_CHAIN_ID = 42161;
export const POLYGON_CHAIN_ID = 137;

export const SWAP_NETWORKS: Record<SwapChainKey, SwapNetwork> = {
  solana: {
    key: "solana",
    name: "Solana",
    kind: "solana",
    alchemyNetwork: "solana-mainnet",
    nativeSymbol: "SOL",
  },
  base: {
    key: "base",
    name: "Base",
    kind: "evm",
    evmChainId: BASE_CHAIN_ID,
    alchemyNetwork: "base-mainnet",
    nativeSymbol: "ETH",
  },
  arbitrum: {
    key: "arbitrum",
    name: "Arbitrum",
    kind: "evm",
    evmChainId: ARBITRUM_CHAIN_ID,
    alchemyNetwork: "arb-mainnet",
    nativeSymbol: "ETH",
  },
  polygon: {
    key: "polygon",
    name: "Polygon",
    kind: "evm",
    evmChainId: POLYGON_CHAIN_ID,
    alchemyNetwork: "polygon-mainnet",
    nativeSymbol: "POL",
  },
};

export const SWAP_NETWORK_ORDER: readonly SwapChainKey[] = [
  "solana",
  "base",
  "arbitrum",
  "polygon",
];

const SOL: TradeAsset = {
  symbol: "SOL",
  name: "Solana",
  bg: "linear-gradient(135deg,#9945FF,#14F195)",
  mint: "So11111111111111111111111111111111111111112",
  decimals: 9,
};
const USDC_SOL: TradeAsset = {
  symbol: "USDC",
  name: "USD Coin",
  bg: "#2775CA",
  mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  decimals: 6,
};
const USDT_SOL: TradeAsset = {
  symbol: "USDT",
  name: "Tether",
  bg: "linear-gradient(135deg,#26A17B,#1a6b50)",
  mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  decimals: 6,
};

// EVM USDC on each chain (native issuances).
const USDC_BASE: TradeAsset = {
  symbol: "USDC",
  name: "USD Coin",
  bg: "#2775CA",
  evmChainId: BASE_CHAIN_ID,
  evmAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  evmDecimals: 6,
};
const USDC_ARBITRUM: TradeAsset = {
  symbol: "USDC",
  name: "USD Coin",
  bg: "#2775CA",
  evmChainId: ARBITRUM_CHAIN_ID,
  evmAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  evmDecimals: 6,
};
const USDC_POLYGON: TradeAsset = {
  symbol: "USDC",
  name: "USD Coin",
  bg: "#2775CA",
  evmChainId: POLYGON_CHAIN_ID,
  evmAddress: "0x3c499c542cEF5E3811e1192cE70d8cC03d5c3359",
  evmDecimals: 6,
};

// Native gas tokens use the aggregator native sentinel: the user swaps the
// native balance they hold for gas, with no ERC-20 approval.
const ETH_BASE: TradeAsset = {
  symbol: "ETH",
  name: "Ethereum",
  bg: "linear-gradient(135deg,#627EEA,#33427c)",
  evmChainId: BASE_CHAIN_ID,
  evmAddress: NATIVE_TOKEN_ADDRESS,
  evmDecimals: 18,
};
const ETH_ARBITRUM: TradeAsset = {
  symbol: "ETH",
  name: "Ethereum",
  bg: "linear-gradient(135deg,#627EEA,#33427c)",
  evmChainId: ARBITRUM_CHAIN_ID,
  evmAddress: NATIVE_TOKEN_ADDRESS,
  evmDecimals: 18,
};
const POL_POLYGON: TradeAsset = {
  symbol: "POL",
  name: "Polygon",
  bg: "linear-gradient(135deg,#8247E5,#5b2fa0)",
  evmChainId: POLYGON_CHAIN_ID,
  evmAddress: NATIVE_TOKEN_ADDRESS,
  evmDecimals: 18,
};
// cbBTC on Base is a standard ERC-20 (needs approval).
const BTC_BASE: TradeAsset = {
  symbol: "BTC",
  name: "Bitcoin",
  bg: "linear-gradient(135deg,#F7931A,#8a5310)",
  evmChainId: BASE_CHAIN_ID,
  evmAddress: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  evmDecimals: 8,
};

// Per-network token lists. First entry is the default "pay" (USDC), second the
// default "receive" (the native token) for that network.
export const SWAP_TOKENS: Record<SwapChainKey, TradeAsset[]> = {
  solana: [USDC_SOL, SOL, USDT_SOL],
  base: [USDC_BASE, ETH_BASE, BTC_BASE],
  arbitrum: [USDC_ARBITRUM, ETH_ARBITRUM],
  polygon: [USDC_POLYGON, POL_POLYGON],
};

// Flat, symbol-deduped union for symbol-keyed uses (ticker chips, price fetch,
// findAsset, perps). First occurrence per symbol wins.
export const TRADE_ASSETS: TradeAsset[] = (() => {
  const seen = new Set<string>();
  const out: TradeAsset[] = [];
  for (const key of SWAP_NETWORK_ORDER) {
    for (const t of SWAP_TOKENS[key]) {
      if (seen.has(t.symbol)) continue;
      seen.add(t.symbol);
      out.push(t);
    }
  }
  return out;
})();

export const PERP_ASSETS: TradeAsset[] = TRADE_ASSETS.filter((a) =>
  ["SOL", "BTC", "ETH"].includes(a.symbol)
);

export const TRADE_PRICE_SYMBOLS = TRADE_ASSETS.map((a) => a.symbol);

export function findAsset(symbol: string): TradeAsset | undefined {
  return TRADE_ASSETS.find((a) => a.symbol === symbol);
}

// The home network of a ticker symbol, used when a market chip jumps into a swap.
export function networkForSymbol(symbol: string): SwapChainKey {
  if (symbol === "SOL" || symbol === "USDT") return "solana";
  return "base";
}

// Both legs carry a Solana mint: a live Jupiter route exists.
export function isRoutable(pay: TradeAsset, receive: TradeAsset): boolean {
  return Boolean(pay.mint && pay.decimals != null && receive.mint && receive.decimals != null);
}

// Both legs are EVM tokens on the same chain: a same-chain LI.FI route exists.
// No chain is special-cased — every supported EVM network routes the same way.
export function isEvmRoutable(pay: TradeAsset, receive: TradeAsset): boolean {
  return Boolean(
    pay.evmAddress &&
    pay.evmDecimals != null &&
    pay.evmChainId != null &&
    receive.evmAddress &&
    receive.evmDecimals != null &&
    receive.evmChainId === pay.evmChainId
  );
}
