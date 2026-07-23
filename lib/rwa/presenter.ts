// Pure presentation and trade logic for the RWA section. No framework imports,
// so every branch here is unit tested. Anything that sizes a trade uses the
// exact base-unit helpers from lib/trade/math and never floating point.

import { toBaseUnits } from "@/lib/trade/math";
import { USDC_BY_CHAIN, type RwaApiAsset, type RwaChain, type RwaQuote } from "@/lib/rwa-api";
import type { TokenBalance } from "@/hooks/use-portfolio";

// Yield APY as a percent number. yieldApyBps is in basis points, so 485 -> 4.85.
export function apyPercent(bps?: number): number | null {
  if (bps == null || !Number.isFinite(bps) || bps <= 0) return null;
  return bps / 100;
}

export function formatApy(bps?: number): string | null {
  const pct = apyPercent(bps);
  return pct == null ? null : `${pct.toFixed(2)}%`;
}

// Compact USD like $1.2M. Returns a muted dash for missing or non-positive input.
export function formatCompactUsd(value?: string | number | null): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  return `$${Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n)}`;
}

// Permissioned assets route through their issuer, not a DEX. Either flag marks one.
export function isIssuerAccess(a: RwaApiAsset): boolean {
  return a.freelyTradable === false || a.accessMode === "issuer";
}

// Only assets the DEX can actually fill get a buy panel.
export function isTradable(a: RwaApiAsset): boolean {
  return a.freelyTradable === true && a.accessMode !== "issuer";
}

// Native gas token and portfolio network id per chain. The portfolio source
// (Alchemy) does not index BSC, so BSC gas cannot be verified from it.
const CHAIN_GAS: Record<RwaChain, { network: string; symbol: string }> = {
  solana: { network: "solana-mainnet", symbol: "SOL" },
  ethereum: { network: "eth-mainnet", symbol: "ETH" },
  base: { network: "base-mainnet", symbol: "ETH" },
  arbitrum: { network: "arb-mainnet", symbol: "ETH" },
  polygon: { network: "polygon-mainnet", symbol: "POL" },
  bsc: { network: "bsc-mainnet", symbol: "BNB" },
};

const PORTFOLIO_NETWORKS = new Set([
  "eth-mainnet",
  "base-mainnet",
  "arb-mainnet",
  "opt-mainnet",
  "polygon-mainnet",
  "solana-mainnet",
]);

export function gasSymbolForChain(chain: RwaChain): string {
  return CHAIN_GAS[chain].symbol;
}

// Whether the wallet holds native gas on the trade chain. The portfolio only
// lists positive balances, so a missing native row on a covered network means
// zero. null means the portfolio source does not cover this chain, so we cannot
// tell and must not block on it.
export function hasNativeGas(tokens: TokenBalance[], chain: RwaChain): boolean | null {
  const { network, symbol } = CHAIN_GAS[chain];
  if (!PORTFOLIO_NETWORKS.has(network)) return null;
  return tokens.some(
    (t) => t.network === network && t.symbol.toUpperCase() === symbol && t.balance > 0
  );
}

export interface RwaErrorInfo {
  message: string;
  retryable: boolean;
  // True when the fix is to fetch a fresh quote before the user tries again.
  requote: boolean;
}

// Maps a backend error code to user-facing copy and how to recover. The default
// covers unknown codes so a failure is never silent.
export function rwaErrorInfo(code: string | undefined, fallback?: string): RwaErrorInfo {
  switch (code) {
    case "NO_ROUTE":
      return { message: "No route can fill this trade", retryable: false, requote: false };
    case "INSUFFICIENT_LIQUIDITY":
      return {
        message: "Not enough liquidity for that size, try smaller",
        retryable: false,
        requote: false,
      };
    case "QUOTE_EXPIRED":
      return {
        message: "The quote expired, we refreshed it. Review and confirm again.",
        retryable: true,
        requote: true,
      };
    case "SIMULATION_FAILED":
      return {
        message: "This trade would fail on-chain, try a smaller size",
        retryable: false,
        requote: false,
      };
    case "ASSET_NOT_TRADABLE":
      return {
        message: "This asset trades through its issuer, not a DEX",
        retryable: false,
        requote: false,
      };
    case "SERVICE_UNAVAILABLE":
    case "BAD_GATEWAY":
    case "502":
      return { message: "RWA service is busy, try again", retryable: true, requote: false };
    default:
      return {
        message: fallback || "Something went wrong with the trade",
        retryable: true,
        requote: false,
      };
  }
}

// Reads the .code a thrown RWA error carries, if any.
export function errorCode(e: unknown): string | undefined {
  if (e && typeof e === "object" && "code" in e) {
    const c = (e as { code?: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

export function pageCount(total: number, perPage: number): number {
  if (perPage <= 0) return 1;
  return Math.max(1, Math.ceil(total / perPage));
}

export function pageSlice<T>(items: readonly T[], page: number, perPage: number): T[] {
  const start = (page - 1) * perPage;
  return items.slice(start, start + perPage);
}

export function clampPage(page: number, total: number, perPage: number): number {
  return Math.min(Math.max(1, page), pageCount(total, perPage));
}

// Estimated asset tokens received for a USD spend, from the asset's USD price.
// Used only for a live preview, so a null price yields a null estimate.
export function estimateReceiveTokens(usd: number, priceUsd: number | null): number | null {
  if (priceUsd == null || priceUsd <= 0 || usd <= 0) return null;
  return usd / priceUsd;
}

// Minimum tokens received, from the quote's amountMin/amount ratio. The ratio
// cancels the asset's on-chain decimals, which the API does not expose, so we
// can show a real slippage floor without them.
export function minReceiveTokens(estReceive: number | null, quote: RwaQuote | null): number | null {
  if (estReceive == null || !quote) return null;
  const amount = Number(quote.output.amount);
  const amountMin = quote.output.amountMin != null ? Number(quote.output.amountMin) : NaN;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(amountMin)) return null;
  return estReceive * (amountMin / amount);
}

export function priceImpactPercent(bps: number | null): number | null {
  if (bps == null || !Number.isFinite(bps)) return null;
  return bps / 100;
}

export function routeLabel(quote: RwaQuote | null): string {
  if (!quote) return "—";
  if (!quote.route || quote.route.length === 0) return quote.provider || "—";
  return quote.route.map((r) => r.venue).join(" + ");
}

// Builds the quote/build request for a buy: pay USDC, receive the asset. The
// USDC amount is converted to base units at the pairing currency's decimals,
// which are 18 on BSC and 6 elsewhere.
export function buyQuoteRequest(
  asset: RwaApiAsset,
  humanUsdc: string,
  slippageBps: number
): {
  chain: RwaChain;
  inputToken: string;
  outputToken: string;
  amountIn: string;
  slippageBps: number;
} {
  const usdc = USDC_BY_CHAIN[asset.chain];
  return {
    chain: asset.chain,
    inputToken: usdc.address,
    outputToken: asset.address,
    amountIn: toBaseUnits(humanUsdc, usdc.decimals).toString(),
    slippageBps,
  };
}

const GRADIENTS = [
  "linear-gradient(135deg,#A78BFA,#6d5bd0)",
  "linear-gradient(135deg,#8B7BE0,#4c3fa0)",
  "linear-gradient(135deg,#5FA8A0,#2c5c56)",
  "linear-gradient(135deg,#E7C97C,#9c7d2e)",
  "linear-gradient(135deg,#4b6cb7,#182848)",
  "linear-gradient(135deg,#76B900,#3c5f00)",
  "linear-gradient(135deg,#00C4B4,#00786d)",
  "linear-gradient(135deg,#C0C6CE,#7c828b)",
];

// Stable gradient for an asset's icon fallback. Deterministic from the seed so
// the same asset always renders the same badge and render stays pure.
export function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(h) % GRADIENTS.length];
}
