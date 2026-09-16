"use client";

import { apiFetch } from "@/lib/api";

// Client for the memecoin trade service, per its integration contract: public
// token discovery, Privy-authenticated wallet linking and swaps on Base and
// Solana. A token is identified by chainId + address, never by address shape. Amounts are decimal strings end to end; the backend verifies every
// trade on-chain and only its CONFIRMED status means success.

export type {
  MemeToken,
  PreparedCall,
  PreparedSolanaSwap,
  PreparedSwap,
  SubmissionReceipt,
  SwapDetail,
  SwapPreview,
  SwapStatus,
  SwapStatusUpdate,
  SwapTokenRef,
  TokenRisk,
  TokenRiskLevel,
  TokenStatus,
  TokenTradability,
  TokenWarning,
  WalletChallenge,
} from "@/lib/meme/types";
import type {
  MemeToken,
  PreparedSolanaSwap,
  PreparedSwap,
  SubmissionReceipt,
  SwapDetail,
  SwapPreview,
  SwapStatusUpdate,
  TokenTradability,
  TokenWarning,
  WalletChallenge,
} from "@/lib/meme/types";
import {
  CATALOG_PAGE_LIMIT,
  isMemecoinHere,
  tradableHere,
  withRiskDefaults,
  type DiscoveryView,
  type Paged,
} from "@/lib/meme/catalog";
import { SOLANA_CHAIN_ID, chainSlug, type MemeChainSlug } from "@/lib/meme/chain";
import { TradeShapeError } from "@/lib/meme/trade-shape-error";

// The normalisation lives in lib/meme/catalog, shared with the server; the
// formatting in lib/meme/format. The feature keeps importing both from here.
export { withRiskDefaults };
export { changeDirection, chartUp, compactUsd, type ChangeDirection } from "@/lib/meme/format";

// Warnings worth showing a buyer. "The token contract is upgradeable" is
// dropped by design: nearly every serious token (USDC included) sits behind an
// upgradeable proxy, so the flag scares users off without telling them
// anything. Matched on code and message so it holds whichever field the
// service keys it on.
export function visibleWarnings(warnings: TokenWarning[]): TokenWarning[] {
  return warnings.filter((w) => !/upgrad/i.test(w.code) && !/upgradeable/i.test(w.message));
}

export interface SwapRequest {
  side: "BUY" | "SELL";
  tokenAddress: string;
  amount: string;
  walletAddress: string;
  slippageBps?: number;
}

// The service error, keeping the machine code the UI branches on and the
// request id the contract says to preserve "in client logs and support
// reports". The message is the service's own wording and is for logs only:
// lib/errors.ts turns the code into our copy, never the message.
export class TradeApiError extends Error {
  code: string;
  status: number;
  requestId: string | null;
  constructor(code: string, message: string, status: number, requestId: string | null = null) {
    super(message);
    // A stable discriminant for lib/errors.ts, which must not import this
    // client module to recognise a trade failure.
    this.name = "TradeApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

interface Envelope {
  success: boolean;
  data?: unknown;
  error?: { code?: string; message?: string; details?: unknown; requestId?: string };
}

// The zod-backed mappers are loaded when a request runs, never on first paint:
// this module is in the first-load payload of /meme and /spot, and a static
// import put zod and every route schema there (1648 → 1714 kB against a 1650
// budget). A call names its mapper; the module arrives with the first trade
// request and is cached by the bundler after that.
type ParserModule = typeof import("@/lib/meme/parse");
type ParserName = {
  [K in keyof ParserModule]: ParserModule[K] extends (data: unknown) => unknown ? K : never;
}[keyof ParserModule];
type Parsed<K extends ParserName> = ReturnType<ParserModule[K]>;

async function loadParser<K extends ParserName>(name: K): Promise<(data: unknown) => Parsed<K>> {
  const parsers = await import("@/lib/meme/parse");
  return parsers[name] as (data: unknown) => Parsed<K>;
}

// Every call names the mapper its route's data goes through (lib/meme/parse.ts)
// rather than casting the envelope to the type it hoped for. A body that does
// not match is a BAD_RESPONSE, carrying the relay's request id when it sent
// one, so drift surfaces as a typed failure rather than a half-shaped object.
async function request<K extends ParserName>(
  path: string,
  parser: K,
  init: RequestInit = {},
  opts: { auth?: boolean } = {}
): Promise<Parsed<K>> {
  const res = await apiFetch(`/api/trade${path}`, init, { requireAuth: opts.auth });
  const body = (await res.json().catch(() => null)) as Envelope | null;
  if (!res.ok || !body?.success) {
    throw new TradeApiError(
      body?.error?.code ?? "SERVICE_UNAVAILABLE",
      body?.error?.message ?? "Trading is unavailable right now.",
      res.status,
      typeof body?.error?.requestId === "string" ? body.error.requestId : null
    );
  }
  const parse = await loadParser(parser);
  try {
    return parse(body.data);
  } catch (error) {
    if (!(error instanceof TradeShapeError)) throw error;
    throw new TradeApiError(
      "BAD_RESPONSE",
      error.message,
      res.status,
      res.headers.get("x-request-id")
    );
  }
}

// The portfolio client (lib/meme/portfolio.ts) goes through the same request,
// so its mappers load on demand too and its failures carry the same codes.
export { request as tradeRequest };

function post<K extends ParserName>(
  path: string,
  payload: unknown,
  parser: K,
  idempotencyKey?: string
): Promise<Parsed<K>> {
  return request(
    path,
    parser,
    {
      method: "POST",
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey, "x-idem-key": idempotencyKey }
        : undefined,
      body: JSON.stringify(payload),
    },
    { auth: true }
  );
}

// Enough Base rows to fill several pages of eight after USDC is dropped.
const TRENDING_FALLBACK_LIMIT = 40;
// Fewer Base rows than this and the trending rail is not worth showing on its
// own; the catalog fallback fills it instead.
const TRENDING_MIN_ROWS = 8;

// The trending upstream currently hangs for ~10s before failing. Give up early
// so the fallback lands while the loading placeholders are still on screen.
const TRENDING_TIMEOUT_MS = 4_000;

// The discovery feed and the persisted catalog are separate upstreams on the
// trade service, so trending can be down while the catalog is healthy. When
// that happens, fall back rather than showing an empty guided view beside a
// working pro table. A catalog page is not ranked by trend, but real tradable
// coins beat an "unavailable" panel. If the catalog is down too, that error
// surfaces and the view shows its unavailable state.
export async function fetchTrendingTokens(): Promise<Paged<MemeToken>> {
  let trending: Paged<MemeToken> | null = null;
  try {
    // Curated by name, not by default: these cards sit on the dashboard with
    // no view switch beside them, so an unrated coin never arrives unasked.
    trending = tradableHere(
      await request("/tokens/trending", "parseTokenPage", {
        signal: AbortSignal.timeout(TRENDING_TIMEOUT_MS),
      }),
      "curated"
    );
  } catch {
    trending = null;
  }
  // Trending ignores ?chain and is mostly Solana, so once the boundary has
  // dropped those it can be three cards. The rail should not show three cards
  // beside a full pro table, so "thin" takes the same fallback as "down".
  if (trending && trending.items.length >= TRENDING_MIN_ROWS) return trending;
  // chain=base matches the "Trending on Base" heading and keeps every address
  // in the EVM form the token detail routes expect.
  return tradableHere(
    await request(`/tokens?page=1&limit=${TRENDING_FALLBACK_LIMIT}&chain=base`, "parseTokenPage"),
    "curated"
  );
}

// One page of the catalogue at the contract's maximum of 500, parsed but not
// judged: the discovery view is applied over the merged pages, so switching
// between Curated and All never asks again, and the meta is the server's.
// `chain` narrows it to one network; omitted, the catalogue is every chain.
export function fetchTokenCatalogPage(
  page: number,
  chain?: MemeChainSlug
): Promise<Paged<MemeToken>> {
  const scope = chain ? `&chain=${chain}` : "";
  return request(`/tokens?page=${page}&limit=${CATALOG_PAGE_LIMIT}${scope}`, "parseTokenPage");
}

// The screener's filtered catalogue, a page of 500 at a time: the backend's
// cost for a filtered read does not depend on the page size, so one request
// covers what fifty small pages would. `query` is screenerQuery's canonical
// string. Parsed but not judged, like fetchTokenCatalogPage: the discovery view
// is applied in the hook, so switching views never asks again.
export const SCREENER_PAGE_LIMIT = CATALOG_PAGE_LIMIT;

export function fetchScreenerPage(page: number, query: string): Promise<Paged<MemeToken>> {
  const filters = query === "" ? "" : `&${query}`;
  return request(`/tokens?page=${page}&limit=${SCREENER_PAGE_LIMIT}${filters}`, "parseTokenPage");
}

// The Trending strip's source: the service's trending ranking narrowed by
// trendingQuery's bounds. Unlike fetchTrendingTokens it has no catalogue
// fallback and no timeout of its own. A failure reaches the hook as an error,
// and the strip shows its retry state rather than a list that is not trending.
export const TRENDING_BOARD_LIMIT = 100;

export function fetchTrendingBoard(
  query: string,
  limit = TRENDING_BOARD_LIMIT
): Promise<Paged<MemeToken>> {
  // Never above the contract's maximum, whatever a surface asks for.
  const size = Math.min(limit, CATALOG_PAGE_LIMIT);
  const filters = query === "" ? "" : `&${query}`;
  return request(`/tokens/trending?limit=${size}${filters}`, "parseTokenPage");
}

// The catalog is the only discovery route that honours ?chain, and this
// client executes on every chain the service does, so it asks for all of
// them. The boundary filter still drops rows the client cannot open (an
// unsupported chain, the quote currency); the server's page meta stays
// authoritative for paging.
//
// `chain` narrows the catalog to one network, for a board lane that shows Base
// or Solana on its own; omitted, the catalog is every chain.
export async function fetchTokenCatalog(
  page = 1,
  limit = 20,
  chain?: MemeChainSlug
): Promise<Paged<MemeToken>> {
  const scope = chain ? `&chain=${chain}` : "";
  // Never above the contract's maximum, whatever a surface asks for.
  const size = Math.min(limit, CATALOG_PAGE_LIMIT);
  const page_ = await request(`/tokens?page=${page}&limit=${size}${scope}`, "parseTokenPage");
  return { ...page_, items: page_.items.filter((token) => isMemecoinHere(token, "curated")) };
}

export async function searchTokens(
  q: string,
  view: DiscoveryView = "curated"
): Promise<MemeToken[]> {
  const rows = await request(
    `/tokens/search?q=${encodeURIComponent(q.trim())}`,
    "parseTokenSearch"
  );
  return rows.filter((token) => isMemecoinHere(token, view));
}

// The detail routes require the chain by name; without it a Solana mint is
// rejected as an invalid EVM address rather than looked up. Addresses go out
// exactly as the service gave them: a Solana address is case-sensitive.
function detailPath(address: string, chainId: number, suffix = ""): string {
  const slug = chainSlug(chainId);
  if (!slug) throw new Error(`Unsupported chain ${chainId}.`);
  return `/tokens/${encodeURIComponent(address)}${suffix}?chain=${slug}`;
}

export async function fetchToken(address: string, chainId: number): Promise<MemeToken> {
  return request(detailPath(address, chainId), "parseTokenView");
}

export function fetchTradability(address: string, chainId: number): Promise<TokenTradability> {
  return request(detailPath(address, chainId, "/tradability"), "parseTradability");
}

export function createWalletChallenge(walletAddress: string): Promise<WalletChallenge> {
  return post("/wallets/challenges", { walletAddress }, "parseWalletChallenge");
}

export function verifyWallet(challengeId: string, signature: string): Promise<void> {
  return post("/wallets/verify", { challengeId, signature }, "parseWalletVerification");
}

// Base and Solana share one request shape and one status lifecycle; only
// the route prefix differs.
function swapsPrefix(chainId: number): string {
  return chainId === SOLANA_CHAIN_ID ? "/solana/swaps" : "/swaps";
}

export function previewSwap(input: SwapRequest, chainId: number): Promise<SwapPreview> {
  return post(`${swapsPrefix(chainId)}/preview`, input, "parseSwapPreview");
}

export function createSolanaWalletChallenge(walletAddress: string): Promise<WalletChallenge> {
  return post("/solana/wallets/challenges", { walletAddress }, "parseWalletChallenge");
}

/** `signature` is the base58 form of the 64-byte Ed25519 signature. */
export function verifySolanaWallet(challengeId: string, signature: string): Promise<void> {
  return post("/solana/wallets/verify", { challengeId, signature }, "parseWalletVerification");
}

export function quoteSolanaSwap(
  input: SwapRequest,
  idempotencyKey: string
): Promise<PreparedSolanaSwap> {
  return post("/solana/swaps/quote", input, "parseSolanaSwapQuote", idempotencyKey);
}

// A Solana submission is the broadcast transaction's base58 signature; there
// is no call index because the quote is one transaction.
export function registerSolanaSubmission(
  swapId: string,
  walletAddress: string,
  signature: string
): Promise<SubmissionReceipt> {
  return post(
    `/solana/swaps/${swapId}/submissions`,
    { walletAddress, signature },
    "parseSubmission"
  );
}

export function quoteSwap(input: SwapRequest, idempotencyKey: string): Promise<PreparedSwap> {
  return post("/swaps/quote", input, "parseSwapQuote", idempotencyKey);
}

// What a Base call broadcast produced: the bundle's transaction hash when the
// receipt arrived, or the user-operation hash when the bundler accepted the
// operation but never handed back a receipt. The contract accepts exactly one
// of the two per callIndex.
export type SubmissionHash = { transactionHash: string } | { userOperationHash: string };

export function registerSubmission(
  swapId: string,
  callIndex: number,
  walletAddress: string,
  submission: SubmissionHash,
  idempotencyKey: string
): Promise<SubmissionReceipt> {
  return post(
    `/swaps/${swapId}/submissions`,
    { walletAddress, callIndex, ...submission },
    "parseSubmission",
    idempotencyKey
  );
}

export function fetchSwapStatus(swapId: string): Promise<SwapStatusUpdate> {
  return request(`/swaps/${swapId}/status`, "parseSwapStatus", {}, { auth: true });
}

export function fetchSwapHistory(page = 1, limit = 20): Promise<Paged<SwapDetail>> {
  return request(`/swaps?page=${page}&limit=${limit}`, "parseSwapPage", {}, { auth: true });
}

// UUID v4 for Idempotency-Key headers. crypto.randomUUID only exists in
// secure contexts (https/localhost), so LAN-IP dev and phone testing fall
// back to building one from getRandomValues.
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// A positive plain-decimal amount the contract accepts ("12" or "12.5"), with
// no more fractional digits than the sold token supports.
export function isValidTradeAmount(amount: string, maxDecimals: number): boolean {
  if (!/^\d+(\.\d+)?$/.test(amount)) return false;
  const frac = amount.split(".")[1];
  if (frac && frac.length > maxDecimals) return false;
  return Number(amount) > 0;
}
