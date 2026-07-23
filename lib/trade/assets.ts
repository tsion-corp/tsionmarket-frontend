// Registry of assets tradable on the unified Trade surface. Assets that carry a
// Solana mint can be routed with a live keyless Jupiter quote. The rest fall
// back to a price-derived preview, flagged clearly in the UI.

export interface TradeAsset {
  symbol: string;
  name: string;
  bg: string;
  // Solana SPL mint. Present only for assets we can route on-chain via Jupiter.
  mint?: string;
  decimals?: number;
  // EVM routing on Base via LI.FI. Present only for assets with a Base token.
  // "ETH" maps to WETH and "BTC" maps to cbBTC on Base.
  evmChainId?: number;
  evmAddress?: string;
  evmDecimals?: number;
}

// Base mainnet chain id. The only EVM chain the Trade surface routes on.
export const BASE_CHAIN_ID = 8453;

export const TRADE_ASSETS: TradeAsset[] = [
  {
    symbol: "SOL",
    name: "Solana",
    bg: "linear-gradient(135deg,#9945FF,#14F195)",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    bg: "#2775CA",
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    evmChainId: BASE_CHAIN_ID,
    evmAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    evmDecimals: 6,
  },
  {
    symbol: "USDT",
    name: "Tether",
    bg: "linear-gradient(135deg,#26A17B,#1a6b50)",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
  },
  {
    symbol: "BTC",
    name: "Bitcoin",
    bg: "linear-gradient(135deg,#F7931A,#8a5310)",
    evmChainId: BASE_CHAIN_ID,
    evmAddress: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    evmDecimals: 8,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    bg: "linear-gradient(135deg,#627EEA,#33427c)",
    evmChainId: BASE_CHAIN_ID,
    evmAddress: "0x4200000000000000000000000000000000000006",
    evmDecimals: 18,
  },
];

export const PERP_ASSETS: TradeAsset[] = TRADE_ASSETS.filter((a) =>
  ["SOL", "BTC", "ETH"].includes(a.symbol)
);

export const TRADE_PRICE_SYMBOLS = TRADE_ASSETS.map((a) => a.symbol);

export function findAsset(symbol: string): TradeAsset | undefined {
  return TRADE_ASSETS.find((a) => a.symbol === symbol);
}

// Both legs must have a Solana mint for a live on-chain route to exist.
export function isRoutable(pay: TradeAsset, receive: TradeAsset): boolean {
  return Boolean(pay.mint && pay.decimals != null && receive.mint && receive.decimals != null);
}

function hasBaseToken(asset: TradeAsset): boolean {
  return (
    asset.evmChainId === BASE_CHAIN_ID && Boolean(asset.evmAddress) && asset.evmDecimals != null
  );
}

// True for a same-VM swap on Base: ETH or BTC paired with USDC, both resolving
// to a Base token address. Cross-VM pairs (e.g. SOL to ETH) are not routable
// here. Prefer isRoutable first so shared assets like USDC stay on Solana.
export function isEvmRoutable(pay: TradeAsset, receive: TradeAsset): boolean {
  if (!hasBaseToken(pay) || !hasBaseToken(receive)) return false;
  const symbols = [pay.symbol, receive.symbol];
  const hasUsdc = symbols.includes("USDC");
  const hasCrypto = symbols.includes("ETH") || symbols.includes("BTC");
  return hasUsdc && hasCrypto;
}
