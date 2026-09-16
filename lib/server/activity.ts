import "server-only";
import {
  EVM_NETWORKS,
  SOLANA_NETWORK,
  isAllowedHolding,
  isRateLimitError,
} from "@/lib/server/alchemy";
import { fetchRwaRegistry, type RwaTokenInfo } from "@/lib/server/rwa-registry";
import { fetchBuyableRegistry, type BuyableRegistry } from "@/lib/server/buyable-registry";
import {
  fetchActionRegistry,
  actionFor,
  type ActionKind,
  type ActionRegistry,
} from "@/lib/server/action-registry";
import { alchemyFetch } from "@/lib/server/alchemy-keys";
import { cached } from "@/lib/server/response-cache";

type RwaRegistry = Record<string, Map<string, RwaTokenInfo>>;

// Alchemy network -> the chain name the logo route takes. Any token address
// resolves through it, so a row never has to fall back to a coloured circle
// for an asset that has a real icon.
const LOGO_CHAIN: Record<string, string> = {
  "base-mainnet": "base",
  "eth-mainnet": "ethereum",
  "arb-mainnet": "arbitrum",
  "polygon-mainnet": "polygon",
  "solana-mainnet": "solana",
};

function tokenLogo(network: string, address: string | null): string | null {
  const chain = LOGO_CHAIN[network];
  return chain && address ? `/api/token-logo/${chain}/${address}` : null;
}

// Solana mints we can name without a registry lookup. The RWA registry covers
// every tradable asset; these are the money it trades against.
const SOLANA_SYMBOLS: Record<string, string> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
};

// Wallet transaction history.
//
// Privy cannot serve this: its transaction API, webhooks and wallet-action list
// all cover server-side (reconstituted) wallets, and getTransactions is
// Swift/Android only. Our wallets are browser embedded wallets signing through
// our own bundler, so none of those record our sends. Alchemy indexes the
// chains instead, which also means transfers the user received show up, not
// only the ones this app sent.

export type ActivityDirection = "in" | "out";

export interface ActivityItem {
  id: string;
  hash: string;
  network: string;
  direction: ActivityDirection;
  symbol: string;
  amount: number;
  // Milliseconds since epoch.
  timestamp: number;
  counterparty: string | null;
  // Server-resolved asset logo, the same one the portfolio renders. Null when
  // the symbol already has a built-in icon or the token is unknown.
  logo: string | null;
  // Set when the counterparty is one of our own contracts, so the feed can name
  // the action (a KASH buy, a wager, a prediction buy) instead of showing a
  // bare "Withdrew"/"Deposited". Absent for plain sends and receives.
  action?: ActionKind;
}

/**
 * One sweep's result.
 *
 * `unavailable` is the point of the type. An empty `items` list means two very
 * different things, this wallet has no history or nothing could be read, and
 * a money app must never show the second as the first. Any source that
 * failed is named here, so the caller can say the list is incomplete instead
 * of presenting it as complete.
 */
export interface ActivityRead {
  items: ActivityItem[];
  /** Sources that did not answer, by network or registry name. Deduplicated. */
  unavailable: string[];
}

/** Thrown when no source answered, so there is no history to report at all. */
export class ActivityUnavailableError extends Error {
  readonly causes: unknown[];

  constructor(causes: unknown[]) {
    super("Activity could not be read from any source");
    this.name = "ActivityUnavailableError";
    this.causes = causes;
  }
}

/**
 * Whether a failed sweep failed because the key pool is spent. The route
 * answers 429 for this and 502 for everything else, and the client backs off
 * rather than retrying. The reason has to be read out of the collected causes:
 * by the time the sweep gives up, the original 429 is one of many.
 */
export function isActivityRateLimited(error: unknown): boolean {
  if (isRateLimitError(error)) return true;
  return error instanceof ActivityUnavailableError && error.causes.some(isRateLimitError);
}

interface RawTransfer {
  // Alchemy's stable, unique id per transfer (for example "0xabc…:log:3"). One
  // transaction can hold several transfers of the same token in the same
  // direction, so this, not the hash, is what makes an item unique.
  uniqueId?: string;
  hash?: string;
  from?: string;
  to?: string | null;
  value?: number | null;
  asset?: string | null;
  category?: string;
  rawContract?: { address?: string | null };
  metadata?: { blockTimestamp?: string };
}

const RPC_HOST: Record<string, string> = {
  "base-mainnet": "base-mainnet",
  "eth-mainnet": "eth-mainnet",
  "arb-mainnet": "arb-mainnet",
  "opt-mainnet": "opt-mainnet",
  "polygon-mainnet": "polygon-mainnet",
  "solana-mainnet": "solana-mainnet",
};

const PER_NETWORK = 25;

/** Networks this sweep can actually ask. The rest of EVM_NETWORKS has no RPC host. */
const ACTIVITY_EVM_NETWORKS = EVM_NETWORKS.filter((network) => network in RPC_HOST);

/**
 * One JSON-RPC call, throwing on anything that is not an answer.
 *
 * It used to return null for every fault, which the callers then read as "no
 * transfers". A wallet with history and a dead upstream produced the same
 * empty list, and the caller had no way to tell them apart. Failures belong to
 * the source tracker in loadActivity now.
 *
 * `null` still means the call succeeded and there is genuinely nothing: an
 * unasked network, or a Solana transaction the node no longer holds.
 */
async function rpc<T>(network: string, method: string, params: unknown): Promise<T | null> {
  const host = RPC_HOST[network];
  if (!host) return null;
  const res = await alchemyFetch((key) => `https://${host}.g.alchemy.com/v2/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  const data = await res.json();
  // Alchemy can answer HTTP 200 with a JSON-RPC error. Reading `result` off
  // that gives undefined, which is not an empty result.
  const rpcError = (data as { error?: { message?: string } } | null)?.error;
  if (rpcError) {
    throw new Error(`${network} ${method} failed: ${rpcError.message ?? "JSON-RPC error"}`);
  }
  return ((data as { result?: T } | null)?.result ?? null) as T | null;
}

/** A source that answered, or the error it failed with. Nothing is discarded. */
type Outcome<T> = { ok: true; value: T } | { ok: false; source: string; error: unknown };

async function attempt<T>(source: string, run: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, source, error };
  }
}

// Networks where Alchemy also indexes `internal` transfers: native ETH moved by
// a contract call rather than a top-level send. Base is the one that matters — a
// Last Man wager and its winnings pay through the gasless 7702 bundler, so the
// ETH moves internally and an external+erc20 query never sees it. Fetched as its
// own call, so a network that does not index internal transfers can only lose
// that extra list, never the main one.
// Alchemy's transfer index carries the "internal" category on these three
// only. Asked for it on Arbitrum or Optimism it answers "The 'internal'
// category is not supported for this network" (seen live on 2026-09-10), so
// asking there is two wasted calls per direction and, on a sweep that reports
// every failed source, a history marked incomplete on every load.
const INTERNAL_NETWORKS = new Set(["base-mainnet", "eth-mainnet", "polygon-mainnet"]);

// One direction of transfers on one network for one category group, newest
// first. Alchemy indexes sends and receives separately, so each direction is
// its own query, and the internal list is its own query again.
async function evmTransfers(
  network: string,
  address: string,
  direction: ActivityDirection,
  categories: string[]
): Promise<RawTransfer[]> {
  const filter: Record<string, unknown> = {
    category: categories,
    withMetadata: true,
    excludeZeroValue: true,
    maxCount: `0x${PER_NETWORK.toString(16)}`,
    order: "desc",
  };
  filter[direction === "in" ? "toAddress" : "fromAddress"] = address;
  const result = await rpc<{ transfers?: RawTransfer[] }>(network, "alchemy_getAssetTransfers", [
    filter,
  ]);
  return result?.transfers ?? [];
}

interface SolanaSignature {
  signature: string;
  blockTime?: number | null;
  err?: unknown;
}

// A SOL delta this small is the cost of transacting, not a transfer: a
// signature is ~0.000005 and a rent-exempt token account ~0.00204. When a
// transaction also moved tokens, reporting that as its own "Sent SOL" row
// buries the trade it paid for.
const SOL_FEE_NOISE = 0.003;

interface TokenBalanceEntry {
  owner?: string;
  mint?: string;
  uiTokenAmount?: { uiAmountString?: string | null };
}

// Token movements for one signature, from the balances the transaction already
// carries — no extra call. Only registry-known mints are reported, the same
// allowlist the portfolio uses, so a dusting airdrop never appears here either.
function solanaTokenDeltas(
  signature: string,
  address: string,
  meta:
    { preTokenBalances?: TokenBalanceEntry[]; postTokenBalances?: TokenBalanceEntry[] } | undefined,
  timestamp: number,
  rwa: RwaRegistry,
  buyable: BuyableRegistry
): ActivityItem[] {
  const read = (rows: TokenBalanceEntry[] | undefined) => {
    const out = new Map<string, number>();
    for (const row of rows ?? []) {
      if (row.owner !== address || !row.mint) continue;
      out.set(row.mint, Number(row.uiTokenAmount?.uiAmountString ?? 0) || 0);
    }
    return out;
  };
  const pre = read(meta?.preTokenBalances);
  const post = read(meta?.postTokenBalances);

  const items: ActivityItem[] = [];
  for (const mint of new Set([...pre.keys(), ...post.keys()])) {
    const delta = (post.get(mint) ?? 0) - (pre.get(mint) ?? 0);
    if (Math.abs(delta) < 1e-9) continue;
    if (!isAllowedHolding(SOLANA_NETWORK, mint, false, rwa, buyable)) continue;
    // An unnameable mint is dropped downstream by the empty-symbol filter
    // rather than shown as a blank row.
    const known = rwa[SOLANA_NETWORK]?.get(mint.toLowerCase());
    const symbol = SOLANA_SYMBOLS[mint] ?? known?.symbol ?? "";
    items.push({
      id: `${signature}:${mint}`,
      hash: signature,
      network: SOLANA_NETWORK,
      direction: delta > 0 ? "in" : "out",
      symbol,
      amount: Math.abs(delta),
      timestamp,
      counterparty: null,
      logo: tokenLogo(SOLANA_NETWORK, mint),
    });
  }
  return items;
}

// Solana has no asset-transfer index, so recent signatures carry the entry and
// the transaction's balance changes give the amounts — native SOL from the
// lamport delta, tokens from the pre/post token balances it already returns.
// `failed` holds the errors from signatures whose transaction could not be
// read. Those rows are missing from `items`, so the sweep reports the feed as
// incomplete rather than losing all of Solana over one unreadable transaction.
async function solanaActivity(
  address: string,
  rwa: RwaRegistry,
  buyable: BuyableRegistry
): Promise<{ items: ActivityItem[]; failed: unknown[] }> {
  const sigs = await rpc<SolanaSignature[]>(SOLANA_NETWORK, "getSignaturesForAddress", [
    address,
    { limit: 10 },
  ]);
  if (!sigs?.length) return { items: [], failed: [] };

  const outcomes = await Promise.all(
    sigs
      .filter((s) => !s.err)
      .map((s) =>
        attempt(SOLANA_NETWORK, async () => {
          const tx = await rpc<{
            meta?: {
              preBalances?: number[];
              postBalances?: number[];
              preTokenBalances?: TokenBalanceEntry[];
              postTokenBalances?: TokenBalanceEntry[];
            };
            transaction?: { message?: { accountKeys?: (string | { pubkey?: string })[] } };
          }>(SOLANA_NETWORK, "getTransaction", [
            s.signature,
            { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
          ]);

          const timestamp = (s.blockTime ?? 0) * 1000;
          const tokens = solanaTokenDeltas(s.signature, address, tx?.meta, timestamp, rwa, buyable);

          const keys = (tx?.transaction?.message?.accountKeys ?? []).map((k) =>
            typeof k === "string" ? k : (k?.pubkey ?? "")
          );
          const index = keys.indexOf(address);
          const pre = tx?.meta?.preBalances?.[index];
          const post = tx?.meta?.postBalances?.[index];
          const deltaSol = index < 0 || pre == null || post == null ? 0 : (post - pre) / 1e9;

          // The fee alongside a trade is not its own event; a real SOL transfer
          // still is.
          const solIsNoise = tokens.length > 0 && Math.abs(deltaSol) < SOL_FEE_NOISE;
          if (deltaSol === 0 || solIsNoise) return tokens;
          return [
            ...tokens,
            {
              id: s.signature,
              hash: s.signature,
              network: SOLANA_NETWORK,
              direction: deltaSol > 0 ? "in" : "out",
              symbol: "SOL",
              amount: Math.abs(deltaSol),
              timestamp,
              logo: null,
              counterparty: null,
            } satisfies ActivityItem,
          ];
        })
      )
  );

  const items: ActivityItem[] = [];
  const failed: unknown[] = [];
  for (const outcome of outcomes) {
    if (outcome.ok) items.push(...outcome.value);
    else failed.push(outcome.error);
  }
  return { items, failed };
}

// Recent wallet activity across every tracked chain, newest first. Spam is
// filtered with the same allowlist the portfolio uses, so a dusting airdrop
// never appears here either.
/**
 * The sweep asks every EVM network we hold an RPC host for, and that is
 * deliberate.
 *
 * It looks expensive and is not: ACTIVITY_EVM_NETWORKS is the intersection of
 * EVM_NETWORKS and RPC_HOST, which is five. So the ceiling is five networks,
 * and narrowing it further can save at most twelve upstream calls once per
 * cache window.
 *
 * A previous version selected networks from the wallet's current balances to
 * claim that saving. It cost more than it was worth: a wallet that had spent
 * everything on a chain lost its history there, a first deposit could stay
 * invisible for the length of two cache windows, and reading the balances
 * added a portfolio fetch of its own. Twelve calls per ninety seconds is not
 * worth quietly deleting someone's transaction history.
 *
 * The real savings on this path are the snapshot below and the bell's slower
 * poll, neither of which can hide anything.
 */

/**
 * How long one wallet's history may be served from a snapshot.
 *
 * One sweep costs an upstream call per network per direction, which is the
 * most expensive read in the app by a wide margin, and history only changes
 * when a transaction lands. Five minutes is half the notification bell's poll
 * on purpose: the bell sits in the topbar on every screen, so without this
 * every signed-in tab paid for a full sweep on every poll
 * (ADR-2026-09-09-portfolio-polling-at-scale).
 */
const ACTIVITY_CACHE_TTL_MS = 5 * 60_000;

export function fetchActivity(evm?: string, solana?: string, limit = 40): Promise<ActivityRead> {
  // No wallet means nothing was asked of any upstream. That is a clean read of
  // nothing, not a failed one, and the route rejects the request before it
  // gets here so the two can never be confused on the wire.
  if (!evm && !solana) return Promise.resolve({ items: [], unavailable: [] });
  // Keyed by the wallets and the page size, so two tabs, two devices and the
  // bell plus the activity view all collapse onto one sweep.
  return cached(
    `activity:${evm ?? ""}:${solana ?? ""}:${limit}`,
    () => loadActivity(evm, solana, limit),
    ACTIVITY_CACHE_TTL_MS
  );
}

// One upstream read the sweep makes. `primary` marks the reads that carry the
// history itself: if every one of those fails there is no history to report,
// and the sweep throws rather than returning a list it knows is not the
// wallet's. The rest (the extra internal-transfer lists, the registries that
// name and filter what came back) can fail on their own without emptying the
// feed, so they only mark it incomplete.
interface TransferSource {
  name: string;
  direction: ActivityDirection;
  primary: boolean;
  run: () => Promise<RawTransfer[]>;
}

async function loadActivity(evm?: string, solana?: string, limit = 40): Promise<ActivityRead> {
  const failures: { source: string; error: unknown }[] = [];
  const noteFailure = (outcome: { ok: false; source: string; error: unknown }) => {
    failures.push({ source: outcome.source, error: outcome.error });
  };

  // Registries name and filter what comes back. Losing one does not empty the
  // feed, but it does silently drop every RWA or catalog token from it, so a
  // list built without one is incomplete rather than complete.
  const [rwaRead, buyableRead, actionRead] = await Promise.all([
    attempt("rwa-registry", fetchRwaRegistry),
    attempt("buyable-registry", fetchBuyableRegistry),
    attempt("action-registry", fetchActionRegistry),
  ]);
  if (!rwaRead.ok) noteFailure(rwaRead);
  if (!buyableRead.ok) noteFailure(buyableRead);
  if (!actionRead.ok) noteFailure(actionRead);
  const rwa: RwaRegistry = rwaRead.ok ? rwaRead.value : {};
  const registries = buyableRead.ok ? buyableRead.value : { buyable: {}, meme: {} };
  const actions: ActionRegistry = actionRead.ok ? actionRead.value : {};

  const sources: TransferSource[] = [];
  if (evm) {
    for (const network of ACTIVITY_EVM_NETWORKS) {
      for (const direction of ["in", "out"] as const) {
        sources.push({
          name: network,
          direction,
          primary: true,
          run: () => evmTransfers(network, evm, direction, ["external", "erc20"]),
        });
        if (INTERNAL_NETWORKS.has(network)) {
          sources.push({
            name: network,
            direction,
            primary: false,
            run: () => evmTransfers(network, evm, direction, ["internal"]),
          });
        }
      }
    }
  }

  const reads = await Promise.all(
    sources.map(async (source) => ({ source, outcome: await attempt(source.name, source.run) }))
  );

  let primaryAttempted = 0;
  let primaryFailed = 0;
  const evmItems: ActivityItem[] = [];

  for (const { source, outcome } of reads) {
    if (source.primary) primaryAttempted += 1;
    if (!outcome.ok) {
      if (source.primary) primaryFailed += 1;
      noteFailure(outcome);
      continue;
    }
    for (const [index, t] of outcome.value.entries()) {
      const contract = t.rawContract?.address ?? null;
      // Both external and internal transfers carry native ETH (only erc20 is a
      // token), so both count as native for the holdings allowlist.
      const isNative = t.category === "external" || t.category === "internal";
      if (!isAllowedHolding(source.name, contract, isNative, rwa, registries.buyable)) continue;
      const amount = typeof t.value === "number" ? t.value : 0;
      if (amount <= 0 || !t.hash) continue;
      const direction = source.direction;
      const counterparty = (direction === "in" ? t.from : t.to) ?? null;
      evmItems.push({
        // Prefer Alchemy's uniqueId; fall back to a per-transfer composite so
        // two transfers of the same token in one tx never share a React key.
        // Always keyed by direction: a self-transfer log matches both the in
        // and out queries with the same uniqueId, and we render both.
        id: `${direction}:${t.uniqueId ?? `${t.hash}:${contract ?? "native"}:${source.name}:${index}`}`,
        hash: t.hash,
        network: source.name,
        direction,
        symbol: t.asset ?? "",
        amount,
        timestamp: Date.parse(t.metadata?.blockTimestamp ?? "") || 0,
        counterparty,
        logo: tokenLogo(source.name, contract),
        action: actionFor(actions, source.name, counterparty, direction),
      });
    }
  }

  let solanaItems: ActivityItem[] = [];
  if (solana) {
    primaryAttempted += 1;
    const outcome = await attempt(SOLANA_NETWORK, () =>
      solanaActivity(solana, rwa, registries.buyable)
    );
    if (outcome.ok) {
      solanaItems = outcome.value.items;
      // Some signatures read, some did not: real rows are missing.
      for (const error of outcome.value.failed) failures.push({ source: SOLANA_NETWORK, error });
    } else {
      primaryFailed += 1;
      noteFailure(outcome);
    }
  }

  // Nothing that carries history answered. Returning [] here is what told the
  // user their account was empty while every Alchemy key was over its monthly
  // capacity.
  if (primaryAttempted > 0 && primaryFailed === primaryAttempted) {
    throw new ActivityUnavailableError(failures.map((f) => f.error));
  }

  const unavailable = [...new Set(failures.map((f) => f.source))].sort();
  if (unavailable.length > 0) {
    // Names only. The list reaches the client, and the causes carry upstream
    // text that is not ours to forward.
    console.warn("Activity read incomplete, sources unavailable:", unavailable.join(", "));
  }

  return {
    items: [...evmItems, ...solanaItems]
      .filter((i) => i.symbol)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit),
    unavailable,
  };
}
