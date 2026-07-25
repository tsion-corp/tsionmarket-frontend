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

// The four chains the portfolio source now indexes.
const PORTFOLIO_NETWORKS = new Set([
  "base-mainnet",
  "arb-mainnet",
  "polygon-mainnet",
  "solana-mainnet",
]);

export function gasSymbolForChain(chain: RwaChain): string {
  return CHAIN_GAS[chain].symbol;
}

// Human network label. The same RWA (symbol) is often deployed on several
// chains, so the table shows this to tell those deployments apart.
export const RWA_CHAIN_LABEL: Record<RwaChain, string> = {
  solana: "Solana",
  ethereum: "Ethereum",
  base: "Base",
  arbitrum: "Arbitrum",
  bsc: "BNB",
  polygon: "Polygon",
};

export function chainLabel(chain: RwaChain): string {
  return RWA_CHAIN_LABEL[chain] ?? chain;
}

// Held tokens on the asset's own chain, the candidates for paying for a buy.
// Empty when the chain isn't tracked (e.g. Ethereum/BSC), in which case the
// caller falls back to USDC.
export function payTokensForChain(tokens: TokenBalance[], chain: RwaChain): TokenBalance[] {
  const { network } = CHAIN_GAS[chain];
  if (!PORTFOLIO_NETWORKS.has(network)) return [];
  return tokens.filter((t) => t.network === network && t.balance > 0);
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

// A sell can only be sized from a holding we can actually see, and the holding
// carries the asset's exact on-chain decimals. So selling is offered only on the
// chains the portfolio source indexes; elsewhere we cannot verify the balance or
// its decimals and must not present a sell.
export function isSellableChain(chain: RwaChain): boolean {
  return PORTFOLIO_NETWORKS.has(CHAIN_GAS[chain].network);
}

// The user's holding of this exact RWA, used to size and gate a sell. Matches on
// the asset's own chain network and contract address. null when the chain isn't
// indexed or the asset isn't held, which is exactly when a sell is not offered.
export function findRwaHolding(tokens: TokenBalance[], asset: RwaApiAsset): TokenBalance | null {
  const { network } = CHAIN_GAS[asset.chain];
  if (!PORTFOLIO_NETWORKS.has(network)) return null;
  const addr = asset.address.toLowerCase();
  return (
    tokens.find(
      (t) => t.network === network && (t.address ?? "").toLowerCase() === addr && t.balance > 0
    ) ?? null
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
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
    case "429":
      return {
        message: "You're going a bit fast. Wait a few seconds, then try again.",
        retryable: true,
        requote: false,
      };
    case "SERVICE_UNAVAILABLE":
    case "BAD_GATEWAY":
    case "502":
      return { message: "RWA service is busy, try again", retryable: true, requote: false };
    default:
      if ((fallback ?? "").toLowerCase().includes("too many requests")) {
        return {
          message: "You're going a bit fast. Wait a few seconds, then try again.",
          retryable: true,
          requote: false,
        };
      }
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

// True when an error is a rate limit, from either its code or message. Used to
// decide whether a read-only call (quote/build) is worth retrying transparently
// instead of interrupting the user.
export function isRateLimitError(code: string | undefined, message?: string): boolean {
  const c = (code ?? "").toUpperCase();
  const m = (message ?? "").toLowerCase();
  return (
    c === "RATE_LIMITED" ||
    c === "TOO_MANY_REQUESTS" ||
    c === "429" ||
    c.includes("RATE") ||
    m.includes("too many requests") ||
    m.includes("rate limit")
  );
}

// True when an RWA error is transient and a read-only retry is worth attempting:
// a rate limit, an upstream 502/service blip, or a bare network failure. Excludes
// deterministic errors (no route, bad input, simulation, expired quote) that a
// retry would not fix.
export function isTransientRwaError(code: string | undefined, message?: string): boolean {
  if (isRateLimitError(code, message)) return true;
  const c = (code ?? "").toUpperCase();
  if (c === "SERVICE_UNAVAILABLE" || c === "BAD_GATEWAY" || c === "502") return true;
  // A bare network/fetch failure carries no backend code.
  if (!code) {
    const m = (message ?? "").toLowerCase();
    return (
      m.includes("fetch") ||
      m.includes("network") ||
      m.includes("timeout") ||
      m.includes("failed to")
    );
  }
  return false;
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

// Estimated USDC received for selling `tokenAmount` of an asset at its USD price.
// Preview only, so a null price yields a null estimate. The mirror of
// estimateReceiveTokens for the sell direction.
export function estimateReceiveUsdc(tokenAmount: number, priceUsd: number | null): number | null {
  if (priceUsd == null || priceUsd <= 0 || tokenAmount <= 0) return null;
  return tokenAmount * priceUsd;
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

// The token a buy is paid with. Defaults to the chain's USDC.
export interface PayToken {
  address: string;
  decimals: number;
}

// Builds the quote/build request for a buy: pay `payToken` (USDC by default),
// receive the asset. The input amount is converted to base units at the pay
// token's own decimals, so any held token sizes correctly.
export function buyQuoteRequest(
  asset: RwaApiAsset,
  humanAmount: string,
  slippageBps: number,
  payToken?: PayToken
): {
  chain: RwaChain;
  inputToken: string;
  outputToken: string;
  amountIn: string;
  slippageBps: number;
} {
  const pay = payToken ?? USDC_BY_CHAIN[asset.chain];
  return {
    chain: asset.chain,
    inputToken: pay.address,
    outputToken: asset.address,
    amountIn: toBaseUnits(humanAmount, pay.decimals).toString(),
    slippageBps,
  };
}

// Builds the quote/build request for a sell: send the RWA, receive the chain's
// USDC. The input amount is sized at the asset's own on-chain decimals, sourced
// from the held balance (the only place those decimals are known), so any RWA
// sizes correctly regardless of its token decimals.
export function sellQuoteRequest(
  asset: RwaApiAsset,
  humanAmount: string,
  slippageBps: number,
  assetDecimals: number
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
    inputToken: asset.address,
    outputToken: usdc.address,
    amountIn: toBaseUnits(humanAmount, assetDecimals).toString(),
    slippageBps,
  };
}

// Canonical wrapped-SOL mint; native SOL is quoted through it.
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

// The input token to send to the quote for a held balance. ERC-20/SPL tokens use
// their contract; native SOL maps to wSOL. EVM native (ETH) is excluded because
// it also pays gas and the RWA router expects a token address.
export function resolvePayToken(t: TokenBalance, chain: RwaChain): PayToken | null {
  if (t.address) return { address: t.address, decimals: t.decimals };
  if (chain === "solana") return { address: WSOL_MINT, decimals: 9 };
  return null;
}

// A selectable pay option for the buy panel, built from the user's holdings on
// the asset's chain. USDC is always present as the default even if not held.
export interface PayOption {
  key: string;
  symbol: string;
  logo: string | null;
  input: PayToken;
  priceUsd: number;
  balance: number;
}

export function buildPayOptions(tokens: TokenBalance[], asset: RwaApiAsset): PayOption[] {
  const chain = asset.chain;
  const usdc = USDC_BY_CHAIN[chain];
  const options: PayOption[] = [];
  for (const t of payTokensForChain(tokens, chain)) {
    const input = resolvePayToken(t, chain);
    if (!input) continue;
    options.push({
      key: input.address,
      symbol: t.symbol,
      logo: t.logo,
      input,
      priceUsd: t.priceUsd,
      balance: t.balance,
    });
  }
  const hasUsdc = options.some((o) => o.key.toLowerCase() === usdc.address.toLowerCase());
  if (!hasUsdc) {
    options.unshift({
      key: usdc.address,
      symbol: "USDC",
      logo: null,
      input: { address: usdc.address, decimals: usdc.decimals },
      priceUsd: 1,
      balance: 0,
    });
  }
  // USDC first, then by held USD value.
  return options.sort((a, b) => {
    const au = a.symbol.toUpperCase() === "USDC" ? 1 : 0;
    const bu = b.symbol.toUpperCase() === "USDC" ? 1 : 0;
    if (au !== bu) return bu - au;
    return b.balance * b.priceUsd - a.balance * a.priceUsd;
  });
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
