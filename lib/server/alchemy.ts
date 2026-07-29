import "server-only";
import { fetchRwaRegistry, type RwaTokenInfo } from "@/lib/server/rwa-registry";
import { fetchBuyableRegistry, type BuyableRegistry } from "@/lib/server/buyable-registry";

// Alchemy Portfolio API. One call returns native + ERC-20 + SPL balances with
// USD prices across every requested network. Key stays server-side.

// The chains we read holdings on: the networks a buy can settle to, so a bought
// asset shows on the chain it landed on. Keep in sync with SUPPORTED_CHAINS in
// lib/buy.ts.
const EVM_NETWORKS = [
  "base-mainnet",
  "eth-mainnet",
  "arb-mainnet",
  "opt-mainnet",
  "polygon-mainnet",
];
const SOLANA_NETWORK = "solana-mainnet";

// How a holding is classified for display: a native coin (ETH/POL/SOL), a
// stablecoin (USDC/USDT), a real-world asset (from the RWA registry), or any
// other token.
export type AssetKind = "coin" | "stablecoin" | "rwa" | "token";

export interface TokenBalance {
  symbol: string;
  name: string;
  network: string;
  address: string | null;
  decimals: number;
  // What kind of asset this is, for the holdings "Type" column.
  kind: AssetKind;
  balance: number;
  // Exact on-chain balance in base units, as a decimal string. `balance` is a
  // lossy float for display; `rawBalance` is the precise integer to send so a
  // "max" never rounds above what the wallet actually holds.
  rawBalance: string;
  priceUsd: number;
  valueUsd: number;
  logo: string | null;
}

export interface Portfolio {
  totalUsd: number;
  tokens: TokenBalance[];
}

interface AlchemyToken {
  network: string;
  tokenAddress?: string | null;
  tokenBalance: string;
  tokenMetadata?: { decimals?: number; logo?: string; name?: string; symbol?: string };
  tokenPrices?: { currency: string; value: string }[];
}

function toRawUnits(hexOrDec: string): bigint {
  return hexOrDec.startsWith("0x") ? BigInt(hexOrDec) : BigInt(hexOrDec || "0");
}

function toNumber(raw: bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}

// Native gas tokens come back from Alchemy with no contract metadata, so we
// resolve their identity per network. Without this, native ETH/POL/SOL shows as
// an "unknown token" AND the gas check (which matches on symbol) fails, which is
// why funded gas still read as "no gas".
const NATIVE_TOKEN: Record<string, { symbol: string; name: string; decimals: number }> = {
  "eth-mainnet": { symbol: "ETH", name: "Ethereum", decimals: 18 },
  "base-mainnet": { symbol: "ETH", name: "Ethereum", decimals: 18 },
  "arb-mainnet": { symbol: "ETH", name: "Ethereum", decimals: 18 },
  "opt-mainnet": { symbol: "ETH", name: "Ethereum", decimals: 18 },
  "polygon-mainnet": { symbol: "POL", name: "Polygon", decimals: 18 },
  "solana-mainnet": { symbol: "SOL", name: "Solana", decimals: 9 },
};

// The stablecoins we always surface per chain. Balances come from Alchemy; a
// tracked stablecoin the user doesn't hold still shows as a zero row so the
// portfolio reflects the full supported set (4 chains x USDC/USDT) for everyone.
const TRACKED_STABLES: Record<string, { symbol: "USDC" | "USDT"; address: string }[]> = {
  "base-mainnet": [
    { symbol: "USDC", address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" },
    { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" },
  ],
  "arb-mainnet": [
    { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
    { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
  ],
  "polygon-mainnet": [
    { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192cE70d8cC03d5c3359" },
    { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" },
  ],
  "solana-mainnet": [
    { symbol: "USDC", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    { symbol: "USDT", address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
  ],
};

const STABLE_NAME: Record<string, string> = { USDC: "USD Coin", USDT: "Tether" };

// The chains we track. Native gas tokens are only shown on these.
const TRACKED_CHAINS = new Set([
  "base-mainnet",
  "eth-mainnet",
  "arb-mainnet",
  "opt-mainnet",
  "polygon-mainnet",
  "solana-mainnet",
]);

// Non-stablecoin assets we still recognize (e.g. swappable cbBTC on Base),
// lowercased address per network.
const ALLOWED_EXTRA: Record<string, string[]> = {
  "base-mainnet": ["0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"], // cbBTC
};

function isTrackedStable(network: string, address: string | null): boolean {
  if (!address) return false;
  const lower = address.toLowerCase();
  return (TRACKED_STABLES[network] ?? []).some((s) => s.address.toLowerCase() === lower);
}

type RwaRegistry = Record<string, Map<string, RwaTokenInfo>>;

// Strict allowlist: only native gas tokens on tracked chains, tracked
// stablecoins, recognized extras, and registered RWA tokens ever appear.
// Everything else — airdrop spam and fake tokens with fabricated prices — is
// hidden for every user.
function isAllowedHolding(
  network: string,
  address: string | null,
  isNative: boolean,
  rwa: RwaRegistry,
  buyable: BuyableRegistry
): boolean {
  if (isNative) return TRACKED_CHAINS.has(network);
  if (!address) return false;
  const lower = address.toLowerCase();
  return (
    isTrackedStable(network, address) ||
    (ALLOWED_EXTRA[network] ?? []).includes(lower) ||
    (rwa[network]?.has(lower) ?? false) ||
    (buyable[network]?.has(lower) ?? false)
  );
}

// Alchemy still tags Polygon results with its legacy "matic-mainnet" id even
// when we request "polygon-mainnet". Canonicalize so native POL resolves and the
// rest of the app (labels, gas checks, funding) sees one consistent network id.
const NETWORK_ALIAS: Record<string, string> = { "matic-mainnet": "polygon-mainnet" };

function normalize(
  tokens: AlchemyToken[],
  rwa: RwaRegistry,
  buyable: BuyableRegistry
): TokenBalance[] {
  const out: TokenBalance[] = [];
  for (const t of tokens) {
    const network = NETWORK_ALIAS[t.network] ?? t.network;
    const isNative = t.tokenAddress == null;
    const address = t.tokenAddress ?? null;
    // Strict allowlist — only recognized tokens (tracked stables, cbBTC, RWAs,
    // and buyable-catalog tokens) ever appear, so no spam or fake token can reach
    // any user's portfolio.
    if (!isAllowedHolding(network, address, isNative, rwa, buyable)) continue;

    const rwaInfo = address ? rwa[network]?.get(address.toLowerCase()) : undefined;
    const native = isNative ? NATIVE_TOKEN[network] : undefined;
    const decimals = native?.decimals ?? t.tokenMetadata?.decimals ?? 18;
    const rawUnits = toRawUnits(t.tokenBalance);
    const balance = toNumber(rawUnits, decimals);
    if (balance <= 0) continue;
    // Resolve identity, falling back to the RWA registry for tokens Alchemy
    // returns without metadata.
    const symbol = native?.symbol ?? t.tokenMetadata?.symbol ?? rwaInfo?.symbol;
    if (!symbol) continue;
    const usdPrice = t.tokenPrices?.find((p) => p.currency === "usd");
    let priceUsd = usdPrice ? parseFloat(usdPrice.value) : 0;
    if (priceUsd === 0 && rwaInfo) priceUsd = rwaInfo.priceUsd;
    // Alchemy sometimes returns an empty price array for a tracked stablecoin
    // (Polygon USDC has done this). They are dollar-pegged, so value a held
    // balance at $1 rather than $0, which would hide a real holding.
    if (priceUsd === 0 && isTrackedStable(network, address)) priceUsd = 1;
    const kind: AssetKind = isNative
      ? "coin"
      : rwaInfo
        ? "rwa"
        : isTrackedStable(network, address)
          ? "stablecoin"
          : "token";
    out.push({
      symbol,
      name: native?.name ?? t.tokenMetadata?.name ?? symbol,
      network,
      address,
      decimals,
      kind,
      balance,
      rawBalance: rawUnits.toString(),
      priceUsd,
      valueUsd: balance * priceUsd,
      logo: t.tokenMetadata?.logo ?? rwaInfo?.logo ?? null,
    });
  }
  return out;
}

// Ensures every supported chain's native token and tracked stablecoins appear,
// even at a zero balance, so the holdings list is a consistent picture of the
// supported set. Held assets stay on top (sorted by value); zero rows follow in
// chain order.
async function withTrackedBaseline(
  held: TokenBalance[],
  networks: string[]
): Promise<TokenBalance[]> {
  const present = new Set(held.map((t) => `${t.network}:${(t.address ?? "native").toLowerCase()}`));
  const nativePrices = await fetchPrices(["ETH", "POL", "SOL"]).catch(() => [] as SymbolPrice[]);
  const priceOf = (symbol: string) => nativePrices.find((p) => p.symbol === symbol)?.priceUsd ?? 0;

  const baseline: TokenBalance[] = [];
  for (const network of networks) {
    const native = NATIVE_TOKEN[network];
    if (native && !present.has(`${network}:native`)) {
      baseline.push({
        symbol: native.symbol,
        name: native.name,
        network,
        address: null,
        decimals: native.decimals,
        kind: "coin",
        balance: 0,
        rawBalance: "0",
        priceUsd: priceOf(native.symbol),
        valueUsd: 0,
        logo: null,
      });
    }
    for (const stable of TRACKED_STABLES[network] ?? []) {
      if (present.has(`${network}:${stable.address.toLowerCase()}`)) continue;
      baseline.push({
        symbol: stable.symbol,
        name: STABLE_NAME[stable.symbol] ?? stable.symbol,
        network,
        address: stable.address,
        decimals: 6,
        kind: "stablecoin",
        balance: 0,
        rawBalance: "0",
        priceUsd: 1,
        valueUsd: 0,
        logo: null,
      });
    }
  }

  // Alchemy occasionally returns a native balance with no price (POL has done
  // this). Backfill from the by-symbol price so gas tokens are never valued at $0
  // when they shouldn't be.
  const patched = held.map((t) => {
    if (t.address === null && t.priceUsd === 0 && priceOf(t.symbol) > 0) {
      const price = priceOf(t.symbol);
      return { ...t, priceUsd: price, valueUsd: t.balance * price };
    }
    return t;
  });

  const heldSorted = patched.sort((a, b) => b.valueUsd - a.valueUsd);
  return [...heldSorted, ...baseline];
}

export interface SymbolPrice {
  symbol: string;
  priceUsd: number;
}

// Free-tier Alchemy keys are partitioned by purpose to spread load, and each
// call rotates through a small pool (purpose key -> fallback -> default) so a
// slow or throttled key fails over instead of hanging. Set the per-purpose keys
// in env; each falls back to ALCHEMY_API_KEY.
// One premium Alchemy key now covers every purpose (portfolio, prices, RPC). The
// old per-purpose key pool only existed to spread free-tier rate limits.
function alchemyKey(): string {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key) throw new Error("No Alchemy API key configured");
  return key;
}

// Thrown with the upstream status folded into the message so route handlers
// and the client's retry guard can both recognize a 429 without re-parsing
// anything. Kept as a plain Error (not a subclass) since it crosses a
// server/client boundary via JSON, where only the message survives anyway.
function alchemyError(status: number): Error {
  return new Error(`Alchemy request failed: ${status}`);
}

export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("429") || message.includes("rate limit") || message.includes("too many");
}

async function alchemyFetch(
  buildUrl: (key: string) => string,
  init?: RequestInit
): Promise<Response> {
  const key = alchemyKey();
  let lastError: unknown;
  // Retry the single key on a transient failure (network error or 5xx). A 4xx
  // (rate limit, bad key) won't improve on retry, so surface it immediately.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // 12s, not 7s: a cold serverless start plus a cold Alchemy connection on
      // the first request can exceed 7s and abort, showing "could not load" on
      // first paint even though a warm retry succeeds.
      const res = await fetch(buildUrl(key), { ...init, signal: AbortSignal.timeout(12_000) });
      if (res.ok) return res;
      lastError = alchemyError(res.status);
      if (res.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("Alchemy request failed");
}

// Short in-memory cache so a burst of near-simultaneous requests — multiple
// browser tabs on the same wallet, every dashboard section re-rendering on
// load, the native-price lookup below that every user's portfolio fetch
// triggers with the identical ["ETH","POL","SOL"] key — collapses into one
// upstream Alchemy call instead of one per caller. Short enough that it never
// reads as stale next to the 30s client poll interval; it only absorbs
// bursts. In-process only: fine for smoothing load, not meant to survive a
// restart or span multiple server instances.
const CACHE_TTL_MS = 15_000;
// Balances change on every deposit/withdraw/wager/claim, and the client now
// refetches per Base block (~2s) via the block watcher. A 15s portfolio cache
// would cap that at 15s stale, so keep it short; premium Alchemy absorbs the
// extra calls. Prices keep the longer TTL (they move slowly).
const PORTFOLIO_CACHE_TTL_MS = 4_000;
const responseCache = new Map<string, { expires: number; value: unknown }>();

async function cached<T>(
  cacheKey: string,
  load: () => Promise<T>,
  ttlMs: number = CACHE_TTL_MS
): Promise<T> {
  const hit = responseCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  responseCache.set(cacheKey, { expires: Date.now() + ttlMs, value });
  return value;
}

export async function fetchPrices(symbols: string[]): Promise<SymbolPrice[]> {
  if (symbols.length === 0) return [];
  const cacheKey = `prices:${[...symbols].sort().join(",")}`;
  return cached(cacheKey, async () => {
    const params = new URLSearchParams();
    for (const s of symbols) params.append("symbols", s);
    const res = await alchemyFetch(
      (key) => `https://api.g.alchemy.com/prices/v1/${key}/tokens/by-symbol?${params.toString()}`
    );
    const data = await res.json();
    const out: SymbolPrice[] = [];
    for (const item of data?.data ?? []) {
      const usd = item?.prices?.find((p: { currency: string }) => p.currency === "usd");
      out.push({ symbol: item.symbol, priceUsd: usd ? parseFloat(usd.value) : 0 });
    }
    return out;
  });
}

export async function fetchPortfolio(evm?: string, solana?: string): Promise<Portfolio> {
  if (!evm && !solana) return { totalUsd: 0, tokens: [] };
  const cacheKey = `portfolio:${evm ?? ""}:${solana ?? ""}`;
  return cached(
    cacheKey,
    async () => {
      const addresses: { address: string; networks: string[] }[] = [];
      if (evm) addresses.push({ address: evm, networks: EVM_NETWORKS });
      if (solana) addresses.push({ address: solana, networks: [SOLANA_NETWORK] });

      const body = JSON.stringify({
        addresses,
        withMetadata: true,
        withPrices: true,
        includeNativeTokens: true,
        includeErc20Tokens: true,
      });
      const res = await alchemyFetch(
        (key) => `https://api.g.alchemy.com/data/v1/${key}/assets/tokens/by-address`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body }
      );

      const [data, rwa, buyable] = await Promise.all([
        res.json(),
        fetchRwaRegistry(),
        fetchBuyableRegistry(),
      ]);
      const held = normalize(data?.data?.tokens ?? [], rwa, buyable);
      // Only baseline the chains the user actually has a wallet on.
      const networks = [...(evm ? EVM_NETWORKS : []), ...(solana ? [SOLANA_NETWORK] : [])];
      const tokens = await withTrackedBaseline(held, networks);
      const totalUsd = tokens.reduce((sum, t) => sum + t.valueUsd, 0);
      return { totalUsd, tokens };
    },
    PORTFOLIO_CACHE_TTL_MS
  );
}
