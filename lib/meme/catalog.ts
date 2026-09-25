import type { MemeToken, TokenRiskLevel } from "@/lib/meme/types";
import {
  BASE_CHAIN_ID,
  SOLANA_CHAIN_ID,
  isQuoteCurrency,
  isSupportedChain,
} from "@/lib/meme/chain";

// Normalisation of the trade service's token lists, shared by the browser
// client and the dashboard feed on the server.

export interface Paged<T> {
  items: T[];
  meta: { page: number; limit: number; total: number };
}

// A page after the discovery view has judged it. `meta` is still the
// server's: `meta.total` is how big the catalogue is, which is what a count
// and a "Load more" read. `shownCount` is how many rows the view kept.
export interface ShownPage<T> extends Paged<T> {
  shownCount: number;
}

// The contract's maximum page size on /tokens.
export const CATALOG_PAGE_LIMIT = 500;

// How long the walk waits between catalogue pages.
//
// The catalogue is not small. Measured against the gateway on 2026-09-16,
// GET /tokens reports meta.total = 144,002, which is 289 pages of 500. Firing
// 289 requests as fast as they round-trip is what the gateway's limiter reads
// as an attack, and it is what took the memecoin service down once already
// (ADR-2026-09-15-meme-trending-screener, "Cost and rate limits": 100 requests
// a minute on /v1, shared by every user of the app because they all come from
// the Next.js server's IP). The gateway's own headers currently advertise a
// larger budget, RateLimit-Policy: q=9000; w=60, but the pace is set against
// the smaller figure because it is the one we have been punished by.
//
// One page every five seconds is 12 requests a minute from one tab: an eighth
// of the 100, and it still leaves room on the same IP for the ten minute
// trending timer, the token detail reads and the swap traffic. The whole walk
// then takes about 24 minutes, which is the point: the list is complete over
// time and the reader watches the pagination grow, instead of the app spending
// its entire budget in the first ten seconds and being cut off.
export const CATALOG_PAGE_INTERVAL_MS = 5_000;

// What a page rejected with HTTP 429 waits before it is asked for again, and
// how many times. 30 s, 60 s, 120 s, 240 s, 300 s: twelve and a half minutes
// of patience before the walk declares itself stalled and waits to be asked.
export const CATALOG_RATE_LIMIT_BASE_MS = 30_000;
export const CATALOG_RATE_LIMIT_MAX_MS = 5 * 60_000;
export const CATALOG_RATE_LIMIT_ATTEMPTS = 5;

// How long to wait before attempting a rate-limited page again. `attempt` is
// 1 for the first wait after a rejection. `retryAfterMs` is what the gateway
// asked for in its Retry-After header, if it sent one: the server knows when
// its window resets and we do not, so its answer wins over the schedule. It is
// still clamped, never below our own pace and never above the cap, so a
// mistaken or hostile header cannot stall the walk for an hour.
export function catalogBackoffMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null && Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(Math.max(retryAfterMs, CATALOG_PAGE_INTERVAL_MS), CATALOG_RATE_LIMIT_MAX_MS);
  }
  const scheduled = CATALOG_RATE_LIMIT_BASE_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(scheduled, CATALOG_RATE_LIMIT_MAX_MS);
}

// How many pages the server's own meta says the list has. What a progress
// readout divides the pages in hand by.
export function catalogPageCount(meta: Paged<unknown>["meta"]): number {
  if (meta.limit <= 0) return 0;
  return Math.ceil(meta.total / meta.limit);
}

// "Continue requesting pages until page * limit >= total." The next page, or
// undefined once the pages so far cover the total.
export function nextCatalogPage(meta: Paged<unknown>["meta"]): number | undefined {
  if (meta.limit <= 0) return undefined;
  return meta.page * meta.limit < meta.total ? meta.page + 1 : undefined;
}

// A token's identity is chainId + address. An EVM address compares without
// case; a Solana mint is case-sensitive and compared exactly as written.
export function catalogKey(token: Pick<MemeToken, "chainId" | "address">): string {
  const address = token.chainId === SOLANA_CHAIN_ID ? token.address : token.address.toLowerCase();
  return `${token.chainId}:${address}`;
}

// Pages appended in the order they were fetched. A row the service moved
// between pages while more were being loaded appears once, where it was first
// seen. The meta is the latest page's, so its total is the freshest.
export function mergeCatalogPages(pages: readonly Paged<MemeToken>[]): Paged<MemeToken> {
  const seen = new Set<string>();
  const items: MemeToken[] = [];
  for (const page of pages) {
    for (const token of page.items) {
      const key = catalogKey(token);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(token);
    }
  }
  const last = pages.at(-1);
  // No pages fetched is an empty catalogue of no known size, not a failure:
  // callers only merge once the first page has landed.
  return { items, meta: last ? last.meta : { page: 0, limit: CATALOG_PAGE_LIMIT, total: 0 } };
}

// Wrapped majors the catalog lists among the memecoins: each chain's gas
// token in token form, and Bitcoin in a Base wrapper. A wrapper worth
// billions between two joke coins makes the whole list read as unfiltered,
// and each of these already has a home on the spot desk.
//
// A list here is a stopgap. What belongs on a memecoin surface is a judgement
// the trade service should make and return, the way it returns a risk
// assessment; until it does, each new wrapper is added here by hand. Keys are
// lowercased on Base; a Solana mint is compared as written.
const WRAPPED_MAJORS: Record<number, Set<string>> = {
  [BASE_CHAIN_ID]: new Set([
    "0x4200000000000000000000000000000000000006", // WETH
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", // cbBTC
  ]),
  [SOLANA_CHAIN_ID]: new Set([
    "So11111111111111111111111111111111111111112", // wrapped SOL
  ]),
};

// Names the majors go by. The discovery feed carries impersonators: dozens
// of Solana rows called "SOL", "Solana", "ETH" or "Ethereum" with liquidity
// in the billions. A coin that claims to be a major is either the major,
// which is not a memecoin, or a scam, so both are dropped. The contract says
// never to identify a token by symbol, and trading never does; this is a
// display rule for a discovery surface, and a stopgap until the service
// stops indexing them.
const MAJOR_SYMBOLS = new Set([
  "SOL",
  "WSOL",
  "ETH",
  "WETH",
  "BTC",
  "WBTC",
  "CBBTC",
  "USDC",
  "USDT",
  "SOLANA",
  "ETHEREUM",
  "BITCOIN",
]);
const MAJOR_NAMES = new Set([
  "solana",
  "wrapped sol",
  "wrapped solana",
  "ethereum",
  "ether",
  "wrapped ether",
  "wrapped ethereum",
  "bitcoin",
  "wrapped bitcoin",
  "tether",
  "usd coin",
]);

export function impersonatesMajor(token: Pick<MemeToken, "symbol" | "name">): boolean {
  const symbol = (token.symbol ?? "").trim().replace(/^\$/, "").toUpperCase();
  if (symbol && MAJOR_SYMBOLS.has(symbol)) return true;
  // "Wrapped Ethereum (Sollet)" is still Ethereum; a suffix in brackets does
  // not make it a different coin.
  const name = (token.name ?? "")
    .trim()
    .replace(/\s*\(.*\)\s*$/, "")
    .toLowerCase();
  return name !== "" && MAJOR_NAMES.has(name);
}

export function isWrappedMajor(chainId: number, address: string): boolean {
  const key = chainId === SOLANA_CHAIN_ID ? address : address.toLowerCase();
  return WRAPPED_MAJORS[chainId]?.has(key) ?? false;
}

// /tokens/trending omits the whole risk block that /tokens returns:
// riskLevel, warnings, buyEnabled and sellEnabled are simply absent. Rendering
// one of those rows raw crashed the dashboard — RiskBadge called .charAt on a
// missing level and Next replaced the page with its unrecoverable-error
// screen. Normalising here rather than in each component keeps every consumer
// safe, per this app's rule that upstream payloads are mapped into our own
// types at the boundary.
//
// buyEnabled/sellEnabled default to TRUE deliberately. The service documents
// them as display hints and repeats every policy check when a quote is
// created, so the server still refuses a token it will not trade. Defaulting
// to false would instead make every trending coin look untradable.
// A token whose risk block may be missing, as the search route sends it.
export type TokenWithOptionalRisk = Omit<
  MemeToken,
  "riskLevel" | "warnings" | "buyEnabled" | "sellEnabled"
> &
  Partial<Pick<MemeToken, "riskLevel" | "warnings" | "buyEnabled" | "sellEnabled">>;

// True when the four fields are all present, so the token already is a
// MemeToken and nothing has to be filled in.
function hasRiskBlock(token: TokenWithOptionalRisk): token is MemeToken {
  return (
    token.riskLevel !== undefined &&
    token.warnings !== undefined &&
    token.buyEnabled !== undefined &&
    token.sellEnabled !== undefined
  );
}

export function withRiskDefaults(token: TokenWithOptionalRisk): MemeToken {
  // A complete token is handed back as it is, not copied. Every row that
  // reaches the discovery views has already been through this at the parse
  // boundary (toMemeToken in lib/meme/parse), so the copy filled nothing in
  // and only cost memory: tradableHere runs over the whole merged catalogue,
  // which is 144,002 rows, and it re-runs every time a page lands. Copying
  // there held a second full set of token objects, roughly 140 MB of heap on
  // top of the pages themselves, and spent 144,002 object spreads per page of
  // the walk to produce rows identical to the ones it was given.
  if (hasRiskBlock(token)) return token;
  return {
    ...token,
    riskLevel: token.riskLevel ?? "UNKNOWN",
    warnings: token.warnings ?? [],
    buyEnabled: token.buyEnabled ?? true,
    sellEnabled: token.sellEnabled ?? true,
  };
}

// Solana discovery is admitted only behind NEXT_PUBLIC_MEME_SOLANA_DISCOVERY=1,
// in both views, and is off by default. It is switched on when ops confirm a
// funding SLA for the Solana gas sponsor wallet: an empty sponsor fails every
// sponsored send at the rent for a token account, so a listed coin that cannot
// be bought is worse than an absent one. Trading code for Solana is untouched
// either way. Read at call time (Next inlines the literal in the browser) so a
// test can stub it.
export function solanaDiscoveryEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MEME_SOLANA_DISCOVERY === "1";
}

function isDiscoveryChain(chainId: number): boolean {
  if (chainId === BASE_CHAIN_ID) return true;
  return chainId === SOLANA_CHAIN_ID && solanaDiscoveryEnabled();
}

// Tokenized shares are not memecoins. The three the trade catalog carried on
// 2026-09-07 (GOOGLc, TSLAc, $BSLN) are named by address, and any row whose
// name is a company's (Inc., Corp., Ltd., plc, AG, S.A.) is treated the same.
// NOT by address prefix: the 0xb2000000… prefix those three share is a Base
// launchpad's vanity pattern that 41 tokens carry, most of them ordinary
// memecoins (Basecat, MOONBASE, BASEJUICE were ACTIVE and LOW risk), and a
// rule on it hid them from the board between #403 and this change.
const TOKENIZED_EQUITIES: ReadonlySet<string> = new Set([
  `${BASE_CHAIN_ID}:0xb2000000000000000000002d0ba3164cc74f58b7`, // GOOGLc
  `${BASE_CHAIN_ID}:0xb2000000000000000000001e800a7f5189430cd0`, // TSLAc
  `${BASE_CHAIN_ID}:0xb200000000000000000000639f1e75d3a2aedd01`, // $BSLN
]);
const CORPORATE_NAME = /\b(inc\.?|corp\.?|corporation|ltd\.?|plc|s\.a\.|ag)$/i;

// Coins hidden from discovery by name, on the maintainers' instruction,
// regardless of rating (2026-09-07: DEGEN). Keyed by chain id and lowercased
// address. Holdings are unaffected: the allowlist reads the catalog directly.
const HIDDEN_MEMECOINS: ReadonlySet<string> = new Set([
  `${BASE_CHAIN_ID}:0x4ed4e862860bed51a9570b96d89af5e1b0efefed`, // DEGEN
]);

export function isHiddenMemecoin(token: Pick<MemeToken, "chainId" | "address">): boolean {
  return HIDDEN_MEMECOINS.has(`${token.chainId}:${token.address.toLowerCase()}`);
}

export function isTokenizedEquity(token: Pick<MemeToken, "chainId" | "address" | "name">): boolean {
  if (TOKENIZED_EQUITIES.has(`${token.chainId}:${token.address.toLowerCase()}`)) return true;
  return CORPORATE_NAME.test((token.name ?? "").trim());
}

// The discovery policy, as two named views (ADR-2026-09-14-memecoins-trade-
// contract, slice 4). What belongs on a memecoin surface is a judgement the
// trade service should make and return; until it does, the judgement is
// written down here rather than scattered through the filters.
//
// `curated` is the default and what staging showed before the switch: the
// maintainers' 2026-09-07 instructions ("remove those unrated and low rated
// meme coins", "all these meme coins that can't be bought", DEGEN off, dead
// pools off). In the service's terms an unrated coin is riskLevel UNKNOWN, the
// low band is HIGH, and CRITICAL rows are BLOCKED. The floors: below $10k of
// liquidity a buy fails at the quote or moves the price by the whole order;
// under $100 of daily volume the pool is dead and its liquidity figure stale
// (WKC on 2026-09-07: $369k of "liquidity" and two cents of volume).
//
// `all` is the trade contract's view: every ACTIVE row on a supported chain.
// Low liquidity is a consent flow there, not a hide: the row shows its risk
// badge and warnings, and the trade surfaces ask before any quote (slice 3).
//
// Both views keep out what is not a memecoin at all, exactly as before: each
// chain's quote currency, the wrapped majors, coins impersonating a major, and
// tokenized equities. Both drop a row whose status is not ACTIVE. Neither
// hides a row because a market figure is null: "where known" means a null
// liquidity or volume passes the floor, since absent is not thin. Holdings are
// unaffected by either: the allowlist reads the catalogue directly and the sell
// sheet fetches a held token by address.
export type DiscoveryView = "curated" | "all";

export const DISCOVERY_VIEWS: readonly DiscoveryView[] = ["curated", "all"];
// A desk opens on All: the market as the service lists it. Curated is a filter
// the reader turns on, not a default that narrows the market unasked, and the
// screener's own liquidity, volume and risk-free bounds do that job in the
// open. The function defaults below stay curated on purpose: they are what a
// caller that names no view gets, and those callers (the dashboard's trending
// cards, the coin picker) are surfaces where an unrated coin should not appear
// on its own.
export const DEFAULT_DISCOVERY_VIEW: DiscoveryView = "all";

export interface DiscoveryRules {
  /** The risk bands listed; null lists every band. */
  riskLevels: ReadonlySet<TokenRiskLevel> | null;
  /** Drop a row the service marks `buyEnabled: false`. */
  requireBuyEnabled: boolean;
  /** Drop a row whose known liquidity is under this; null sets no floor. */
  minLiquidityUsd: number | null;
  /** Drop a row whose known 24h volume is under this; null sets no floor. */
  minVolume24hUsd: number | null;
  /** Apply the maintainers' by-address hidden list (DEGEN). */
  hideNamedCoins: boolean;
}

export const MIN_DISCOVERY_LIQUIDITY_USD = 10_000;
export const MIN_DISCOVERY_VOLUME_24H_USD = 100;

export const DISCOVERY_POLICY: Readonly<Record<DiscoveryView, Readonly<DiscoveryRules>>> =
  Object.freeze({
    curated: Object.freeze({
      riskLevels: new Set<TokenRiskLevel>(["LOW", "MEDIUM"]),
      requireBuyEnabled: true,
      minLiquidityUsd: MIN_DISCOVERY_LIQUIDITY_USD,
      minVolume24hUsd: MIN_DISCOVERY_VOLUME_24H_USD,
      hideNamedCoins: true,
    }),
    all: Object.freeze({
      riskLevels: null,
      requireBuyEnabled: false,
      minLiquidityUsd: null,
      minVolume24hUsd: null,
      hideNamedCoins: false,
    }),
  });

function belowFloor(value: string | null | undefined, floor: number | null): boolean {
  if (floor === null) return false;
  if (value === null || value === undefined) return false; // absent is not thin
  const n = Number(value);
  return Number.isFinite(n) && n < floor;
}

// Not a memecoin, in either view.
function isNotAMemecoin(token: MemeToken): boolean {
  return (
    !isSupportedChain(token.chainId) ||
    !isDiscoveryChain(token.chainId) ||
    isQuoteCurrency(token.chainId, token.address) ||
    isWrappedMajor(token.chainId, token.address) ||
    impersonatesMajor(token) ||
    isTokenizedEquity(token)
  );
}

export function isMemecoinHere(token: MemeToken, view: DiscoveryView = "curated"): boolean {
  if (isNotAMemecoin(token)) return false;
  // A status is given on the catalogue; the trending and search routes omit it.
  if (token.status !== undefined && token.status !== "ACTIVE") return false;
  const rules = DISCOVERY_POLICY[view];
  if (rules.riskLevels && !rules.riskLevels.has(token.riskLevel ?? "UNKNOWN")) return false;
  if (rules.requireBuyEnabled && token.buyEnabled === false) return false;
  if (belowFloor(token.liquidityUsd, rules.minLiquidityUsd)) return false;
  if (belowFloor(token.volume24hUsd, rules.minVolume24hUsd)) return false;
  if (rules.hideNamedCoins && isHiddenMemecoin(token)) return false;
  return true;
}

// The view applied to one page or to the merged pages. The server's meta is
// passed through untouched; the filtered size is `shownCount`.
export function tradableHere(
  page: Paged<MemeToken>,
  view: DiscoveryView = "curated"
): ShownPage<MemeToken> {
  const items = page.items.filter((token) => isMemecoinHere(token, view)).map(withRiskDefaults);
  return { items, meta: page.meta, shownCount: items.length };
}

// True when a row has something for the Trending strip to show: a price, or a
// 24h change, or both. A row with neither is an empty shell.
//
// The change is read the way changeFor reads it for 24h, the flat field
// included, because that flat field is what the card draws when the service
// sends no activity block (the catalogue rows the board falls back to are
// often exactly that). changeFor itself is not called here: lib/meme/momentum
// imports this module, so importing it back would make the two a cycle.
function rankable(token: MemeToken): boolean {
  if ((token.priceUsd ?? null) !== null) return true;
  const change = token.activity?.["24h"]?.priceChangePercent ?? token.priceChange24hPercent ?? null;
  return change !== null;
}

/**
 * The Trending strip's rows: `tradableHere`, minus the rows there is nothing
 * to rank.
 *
 * The strip's heading promises the hottest coins over a window. On 2026-09-16
 * the trade service answered /tokens/trending with 40 rows of which 35 carried
 * no price and no 24h change, and the top cards on production rendered as a
 * name over two dashes. A row with neither figure cannot be one of the hottest
 * coins, whichever position the service returned it in, so the strip falls
 * through to the next row that has one.
 *
 * Only the strip uses this. The catalogue still lists a token with no price
 * yet: there it is an entry in a directory, not a claim about performance.
 */
export function rankableHere(
  page: Paged<MemeToken>,
  view: DiscoveryView = "curated"
): ShownPage<MemeToken> {
  const shown = tradableHere(page, view);
  const items = shown.items.filter(rankable);
  return { items, meta: shown.meta, shownCount: items.length };
}
