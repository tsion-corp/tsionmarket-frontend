import "server-only";
import { fetchRwaRegistry, type RwaTokenInfo } from "@/lib/server/rwa-registry";
import {
  fetchBuyableRegistry,
  type BuyableRegistry,
  type MemeRegistry,
} from "@/lib/server/buyable-registry";
import { displaySymbol } from "@/lib/buy";
import { isPolymarketCollateral } from "@/lib/polymarket/config";

// Alchemy Portfolio API. One call returns native + ERC-20 + SPL balances with
// USD prices across every requested network. Key stays server-side.

// The chains we read holdings on: the networks a buy can settle to, so a bought
// asset shows on the chain it landed on. Keep in sync with SUPPORTED_CHAINS in
// lib/buy.ts.
//
// Every network past the original five passed two checks: an eth_chainId call
// against Alchemy's own RPC confirmed the chain ID, and a real call to this
// Portfolio API (assets/tokens/by-address, the endpoint fetchPortfolio below
// actually uses) accepted the network instead of returning "Unsupported
// network." The two do not agree on the same set — see the comment on
// SUPPORTED_CHAINS in lib/buy.ts for exactly which labels were dropped and
// why. This API also caps a request at 20 networks total ("Invalid number of
// networks (1-20 allowed)"), which is why fetchPortfolio below batches.
export const EVM_NETWORKS = [
  "base-mainnet",
  "eth-mainnet",
  "arb-mainnet",
  "opt-mainnet",
  "polygon-mainnet",
  "apechain-mainnet",
  "berachain-mainnet",
  "bnb-mainnet",
  "celo-mainnet",
  "gensyn-mainnet",
  "hyperliquid-mainnet",
  "ink-mainnet",
  "monad-mainnet",
  "robinhood-mainnet",
  "shape-mainnet",
  "soneium-mainnet",
  "unichain-mainnet",
  "worldchain-mainnet",
  "gnosis-mainnet",
  "linea-mainnet",
  "zksync-mainnet",
  "scroll-mainnet",
  "avax-mainnet",
  "blast-mainnet",
  "zora-mainnet",
  "ronin-mainnet",
  "abstract-mainnet",
  "mythos-mainnet",
];
export const SOLANA_NETWORK = "solana-mainnet";

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
  // In the trade-service meme catalog: sells route through the meme trade
  // sheet, not Dextopus (which cannot quote these tokens).
  meme?: boolean;
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
//
// Symbol, name, and decimals for the networks past the original six came from
// viem's chain registry (already a dependency here), looked up by chain ID.
// One override: viem's entry for chain ID 999 is a stale "Zora Goerli Testnet"
// left over from a retired network, not hyperliquid-mainnet, which now also
// uses that chain ID. HYPE/18 came from Hyperliquid's own docs instead.
// mythos-mainnet has no entry: it is not in viem's registry and no other
// source was confirmed, so its native balance is not resolved. ERC-20 tokens
// bought there still work, since that path does not depend on this map. No
// entry exists for a network the Portfolio API itself does not support (see
// the comment on EVM_NETWORKS above) — there is nothing to resolve a native
// balance from if the network is never queried.
const NATIVE_TOKEN: Record<string, { symbol: string; name: string; decimals: number }> = {
  "eth-mainnet": { symbol: "ETH", name: "Ethereum", decimals: 18 },
  "base-mainnet": { symbol: "ETH", name: "Ethereum", decimals: 18 },
  "arb-mainnet": { symbol: "ETH", name: "Ethereum", decimals: 18 },
  "opt-mainnet": { symbol: "ETH", name: "Ethereum", decimals: 18 },
  "polygon-mainnet": { symbol: "POL", name: "Polygon", decimals: 18 },
  "solana-mainnet": { symbol: "SOL", name: "Solana", decimals: 9 },
  "apechain-mainnet": { symbol: "APE", name: "ApeCoin", decimals: 18 },
  "berachain-mainnet": { symbol: "BERA", name: "BERA Token", decimals: 18 },
  "bnb-mainnet": { symbol: "BNB", name: "BNB", decimals: 18 },
  "celo-mainnet": { symbol: "CELO", name: "CELO", decimals: 18 },
  "gensyn-mainnet": { symbol: "ETH", name: "Ether", decimals: 18 },
  "hyperliquid-mainnet": { symbol: "HYPE", name: "Hyperliquid", decimals: 18 },
  "ink-mainnet": { symbol: "ETH", name: "Ether", decimals: 18 },
  "monad-mainnet": { symbol: "MON", name: "Monad", decimals: 18 },
  "robinhood-mainnet": { symbol: "ETH", name: "Ether", decimals: 18 },
  "shape-mainnet": { symbol: "ETH", name: "Ether", decimals: 18 },
  "soneium-mainnet": { symbol: "ETH", name: "Ether", decimals: 18 },
  "unichain-mainnet": { symbol: "ETH", name: "Ether", decimals: 18 },
  "worldchain-mainnet": { symbol: "ETH", name: "Ether", decimals: 18 },
  "gnosis-mainnet": { symbol: "XDAI", name: "xDAI", decimals: 18 },
  "linea-mainnet": { symbol: "ETH", name: "Linea Ether", decimals: 18 },
  "zksync-mainnet": { symbol: "ETH", name: "Ether", decimals: 18 },
  "scroll-mainnet": { symbol: "ETH", name: "Ether", decimals: 18 },
  "avax-mainnet": { symbol: "AVAX", name: "Avalanche", decimals: 18 },
  "blast-mainnet": { symbol: "ETH", name: "Ether", decimals: 18 },
  "zora-mainnet": { symbol: "ETH", name: "Ether", decimals: 18 },
  "ronin-mainnet": { symbol: "RON", name: "RON", decimals: 18 },
  "abstract-mainnet": { symbol: "ETH", name: "ETH", decimals: 18 },
};

// The symbols to ask the by-symbol price endpoint for when a native balance
// comes back unpriced. Derived from NATIVE_TOKEN rather than written out, so a
// chain added there can never be left unpriced.
//
// This is not a rare fallback. The Portfolio API prices native ETH on
// eth-mainnet and base-mainnet but returns an EMPTY tokenPrices array for the
// native coin of every chain past the original set — verified live against
// apechain-mainnet (APE) and hyperliquid-mainnet (HYPE). This list used to be a
// hard-coded ["ETH", "POL", "SOL"], so a bought APE or a swapped HYPE was
// fetched correctly, valued at $0, and then dropped by the holdings table,
// whose "hide zero-value assets" toggle defaults on: the owner was told they
// held nothing. Two users reported exactly that, on exactly those two chains.
// All twelve symbols resolve against the price endpoint, and twelve is inside
// its 25-symbol per-request cap, so this stays one upstream call.
export const NATIVE_PRICE_SYMBOLS = [
  ...new Set(Object.values(NATIVE_TOKEN).map((t) => t.symbol)),
].sort();

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

// The chains we track. Native gas tokens are only shown on these. Kept as
// exactly the keys of NATIVE_TOKEN: a chain here without an entry there would
// let a native balance past the allowlist and then drop it anyway for having
// no resolvable symbol, which is why mythos-mainnet stays out of both.
const TRACKED_CHAINS = new Set(Object.keys(NATIVE_TOKEN));

// Non-stablecoin assets we still recognize (e.g. swappable cbBTC on Base),
// lowercased address per network.
const ALLOWED_EXTRA: Record<string, string[]> = {
  "base-mainnet": [
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", // cbBTC
    "0xcbd06e5a2b0c65597161de254aa074e489deb510", // cbDOGE, verified on-chain: symbol "cbDOGE", 8 decimals
  ],
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
export function isAllowedHolding(
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
    isPolymarketCollateral(network, address) ||
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
  buyable: BuyableRegistry,
  meme: MemeRegistry
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
    const memeInfo = address ? meme[network]?.get(address.toLowerCase()) : undefined;
    const predictionCollateral = isPolymarketCollateral(network, address);
    const usdPrice = t.tokenPrices?.find((p) => p.currency === "usd");
    let priceUsd = usdPrice ? parseFloat(usdPrice.value) : 0;
    if (priceUsd === 0 && rwaInfo) priceUsd = rwaInfo.priceUsd;
    // Memecoins: Alchemy rarely prices them, but the trade catalog does.
    if (priceUsd === 0 && memeInfo) priceUsd = memeInfo.priceUsd;
    // Alchemy sometimes returns an empty price array for a tracked stablecoin
    // (Polygon USDC has done this). They are dollar-pegged, so value a held
    // balance at $1 rather than $0, which would hide a real holding.
    if (priceUsd === 0 && (isTrackedStable(network, address) || predictionCollateral)) priceUsd = 1;
    // A wrapped representation (cbBTC, cbDOGE) displays as the coin it
    // represents, not its own contract ticker or on-chain name — the raw
    // resolved symbol above still governs identity checks (isTrackedStable,
    // the network value, sell/send routing), and the contract's own
    // name/symbol/network are unchanged on-chain; only what is shown to the
    // user changes. kind is display-only everywhere it is read (the type
    // pill, the balance breakdown bucket) so aliasing it directly is safe —
    // unlike network, nothing downstream needs it to stay "token".
    const shownSymbol = displaySymbol(symbol);
    const aliased = shownSymbol !== symbol;
    const kind: AssetKind = aliased
      ? "coin"
      : isNative
        ? "coin"
        : rwaInfo
          ? "rwa"
          : isTrackedStable(network, address) || predictionCollateral
            ? "stablecoin"
            : "token";
    out.push({
      symbol: shownSymbol,
      name: aliased ? shownSymbol : (native?.name ?? t.tokenMetadata?.name ?? symbol),
      network,
      address,
      decimals,
      kind,
      balance,
      rawBalance: rawUnits.toString(),
      priceUsd,
      valueUsd: balance * priceUsd,
      logo: t.tokenMetadata?.logo ?? rwaInfo?.logo ?? memeInfo?.logo ?? null,
      meme: memeInfo != null,
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
  const nativePrices = await fetchPrices(NATIVE_PRICE_SYMBOLS).catch(() => [] as SymbolPrice[]);
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

  // Alchemy returns a native balance with no price for every chain outside the
  // original set, and occasionally for one inside it (POL has done this).
  // Backfill from the by-symbol price so a gas token is never valued at $0 when
  // it shouldn't be — a $0 value is what makes a real holding disappear from the
  // holdings table entirely.
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
// triggers with the identical NATIVE_PRICE_SYMBOLS key — collapses into one
// upstream Alchemy call instead of one per caller. Short enough that it never
// reads as stale next to the 30s client poll interval; it only absorbs
// bursts. In-process only: fine for smoothing load, not meant to survive a
// restart or span multiple server instances.
const CACHE_TTL_MS = 15_000;
// Prices move slowly and the client polls at 60s; a longer window here means
// each distinct symbol set costs at most one upstream call per interval, and
// a 429 during a burst finds a fresh-enough snapshot to serve instead.
const PRICES_CACHE_TTL_MS = 45_000;
// Balances change on every deposit/withdraw/wager/claim, and the client
// refetches on Base blocks (throttled client-side). Keep the portfolio TTL
// short so those refreshes see movement; prices keep the longer TTL (they
// move slowly).
const PORTFOLIO_CACHE_TTL_MS = 4_000;
// How long past expiry a snapshot may still stand in when the upstream call
// fails. Slightly stale balances beat an error flash — but a snapshot old
// enough to be from a different world must not.
const STALE_SERVE_MS = 60_000;
const responseCache = new Map<string, { expires: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(
  cacheKey: string,
  load: () => Promise<T>,
  ttlMs: number = CACHE_TTL_MS,
  // Set when the caller has just changed the balances and needs to observe its
  // own effect. Reading a cached snapshot there shows the pre-trade state and
  // then holds it until the next poll.
  skipCache = false
): Promise<T> {
  const hit = responseCache.get(cacheKey);
  if (!skipCache) {
    if (hit && hit.expires > Date.now()) return hit.value as T;
    // Concurrent misses share one upstream call instead of each firing their
    // own — the burst pattern that walks straight into a rate limit.
    const pending = inflight.get(cacheKey);
    if (pending) return pending as Promise<T>;
  }
  const run = (async () => {
    try {
      const value = await load();
      responseCache.set(cacheKey, { expires: Date.now() + ttlMs, value });
      return value;
    } catch (error) {
      // A throttled or failing upstream serves the recent snapshot rather
      // than erroring every caller for the length of the outage.
      if (hit && hit.expires > Date.now() - STALE_SERVE_MS) return hit.value as T;
      throw error;
    } finally {
      inflight.delete(cacheKey);
    }
  })();
  if (!skipCache) inflight.set(cacheKey, run);
  return run;
}

function cachedPrices<T>(cacheKey: string, load: () => Promise<T>): Promise<T> {
  return cached(cacheKey, load, PRICES_CACHE_TTL_MS);
}

// Alchemy's by-symbol price endpoint refuses more than 25 symbols in one
// request ("Maximum 25 symbols per request", verified live). The client folds
// every dashboard section's symbols into one call on purpose, and the spot
// list now runs well past 25, so the split has to happen here.
export const PRICE_SYMBOLS_PER_REQUEST = 25;

export async function fetchPrices(symbols: string[]): Promise<SymbolPrice[]> {
  if (symbols.length === 0) return [];
  const unique = [...new Set(symbols)].sort();
  const cacheKey = `prices:${unique.join(",")}`;
  return cachedPrices(cacheKey, async () => {
    const pages = await Promise.all(
      chunk(unique, PRICE_SYMBOLS_PER_REQUEST).map(async (page) => {
        const params = new URLSearchParams();
        for (const s of page) params.append("symbols", s);
        const res = await alchemyFetch(
          (key) =>
            `https://api.g.alchemy.com/prices/v1/${key}/tokens/by-symbol?${params.toString()}`
        );
        return res.json();
      })
    );
    const out: SymbolPrice[] = [];
    for (const data of pages) {
      for (const item of data?.data ?? []) {
        const usd = item?.prices?.find((p: { currency: string }) => p.currency === "usd");
        out.push({ symbol: item.symbol, priceUsd: usd ? parseFloat(usd.value) : 0 });
      }
    }
    return out;
  });
}

// Alchemy's tokens/by-address endpoint rejects a request with more than 20
// networks total ("Invalid number of networks (1-20 allowed)") — verified
// live. EVM_NETWORKS now has more than that, so a single request that asked
// for all of them started failing outright the moment it grew past 20,
// taking down the whole portfolio rather than just the newest chains. Split
// into batches instead.
const NETWORKS_PER_REQUEST = 20;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// The API paginates: a wallet queried across many networks at once easily
// exceeds one page (100 tokens here — this wallet alone has accumulated
// far more than that in spam/airdrop tokens across the now-larger network
// list), and a real holding can land on any page, not just the first. A
// response can also carry both `data.tokens` (whatever it did resolve) and
// a top-level `error` for the networks it could not (verified live: one
// specific network failing this way did not fail the whole batch) — neither
// case is an HTTP failure, so alchemyFetch's ok check does not see either of
// them; both are handled here instead.
const MAX_PAGES = 10;

async function fetchTokensByAddress(
  addresses: { address: string; networks: string[] }[]
): Promise<AlchemyToken[]> {
  const out: AlchemyToken[] = [];
  let pageKey: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = JSON.stringify({
      addresses,
      withMetadata: true,
      withPrices: true,
      includeNativeTokens: true,
      includeErc20Tokens: true,
      ...(pageKey ? { pageKey } : {}),
    });
    const res = await alchemyFetch(
      (key) => `https://api.g.alchemy.com/data/v1/${key}/assets/tokens/by-address`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body }
    );
    const data = await res.json();
    out.push(...(data?.data?.tokens ?? []));
    pageKey = data?.data?.pageKey ?? undefined;
    if (!pageKey) break;
  }
  return out;
}

export async function fetchPortfolio(
  evm?: string,
  solana?: string,
  skipCache = false
): Promise<Portfolio> {
  if (!evm && !solana) return { totalUsd: 0, tokens: [] };
  const cacheKey = `portfolio:${evm ?? ""}:${solana ?? ""}`;
  return cached(
    cacheKey,
    async () => {
      const requests: Promise<AlchemyToken[]>[] = [];
      if (evm) {
        for (const networks of chunk(EVM_NETWORKS, NETWORKS_PER_REQUEST)) {
          requests.push(fetchTokensByAddress([{ address: evm, networks }]));
        }
      }
      if (solana) {
        requests.push(fetchTokensByAddress([{ address: solana, networks: [SOLANA_NETWORK] }]));
      }

      const [batchResults, rwa, registries] = await Promise.all([
        Promise.allSettled(requests),
        fetchRwaRegistry(),
        fetchBuyableRegistry(),
      ]);
      // One batch (a chunk of networks) failing should not blank holdings on
      // every other chunk that succeeded — log it and keep going with what
      // came back. Only every batch failing propagates, so cached()'s
      // stale-serve fallback still applies to a total outage.
      const failed = batchResults.filter((r) => r.status === "rejected");
      if (failed.length > 0 && failed.length === batchResults.length) {
        throw (failed[0] as PromiseRejectedResult).reason;
      }
      if (failed.length > 0) {
        console.error(
          `fetchPortfolio: ${failed.length}/${batchResults.length} network batches failed`,
          failed.map((r) => (r as PromiseRejectedResult).reason)
        );
      }
      const tokensFromBatches = batchResults
        .filter((r): r is PromiseFulfilledResult<AlchemyToken[]> => r.status === "fulfilled")
        .flatMap((r) => r.value);
      const held = normalize(tokensFromBatches, rwa, registries.buyable, registries.meme);
      // Only baseline the chains the user actually has a wallet on.
      const networks = [...(evm ? EVM_NETWORKS : []), ...(solana ? [SOLANA_NETWORK] : [])];
      const tokens = await withTrackedBaseline(held, networks);
      const totalUsd = tokens.reduce((sum, t) => sum + t.valueUsd, 0);
      return { totalUsd, tokens };
    },
    PORTFOLIO_CACHE_TTL_MS,
    skipCache
  );
}
