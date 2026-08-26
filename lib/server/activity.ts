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

function key(): string {
  const k = process.env.ALCHEMY_API_KEY;
  if (!k) throw new Error("No Alchemy API key configured");
  return k;
}

async function rpc<T>(network: string, method: string, params: unknown): Promise<T | null> {
  const host = RPC_HOST[network];
  if (!host) return null;
  try {
    const res = await fetch(`https://${host}.g.alchemy.com/v2/${key()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 429) throw new Error("Alchemy request failed: 429");
      return null;
    }
    const data = await res.json();
    return (data?.result ?? null) as T | null;
  } catch (error) {
    if (isRateLimitError(error)) throw error;
    return null;
  }
}

// Networks where Alchemy also indexes `internal` transfers: native ETH moved by
// a contract call rather than a top-level send. Base is the one that matters — a
// Last Man wager and its winnings pay through the gasless 7702 bundler, so the
// ETH moves internally and an external+erc20 query never sees it. Fetched as its
// own call, so a network that does not index internal transfers can only lose
// that extra list, never the main one.
const INTERNAL_NETWORKS = new Set([
  "base-mainnet",
  "eth-mainnet",
  "arb-mainnet",
  "opt-mainnet",
  "polygon-mainnet",
]);

// One direction of transfers on one network, newest first. Alchemy indexes sends
// and receives separately, so each direction is its own query.
async function evmTransfers(
  network: string,
  address: string,
  direction: ActivityDirection
): Promise<RawTransfer[]> {
  const query = (categories: string[]) => {
    const filter: Record<string, unknown> = {
      category: categories,
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: `0x${PER_NETWORK.toString(16)}`,
      order: "desc",
    };
    filter[direction === "in" ? "toAddress" : "fromAddress"] = address;
    return rpc<{ transfers?: RawTransfer[] }>(network, "alchemy_getAssetTransfers", [filter]).then(
      (result) => result?.transfers ?? []
    );
  };

  const [main, internal] = await Promise.all([
    query(["external", "erc20"]),
    INTERNAL_NETWORKS.has(network) ? query(["internal"]) : Promise.resolve<RawTransfer[]>([]),
  ]);
  return [...main, ...internal];
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
async function solanaActivity(
  address: string,
  rwa: RwaRegistry,
  buyable: BuyableRegistry
): Promise<ActivityItem[]> {
  const sigs = await rpc<SolanaSignature[]>(SOLANA_NETWORK, "getSignaturesForAddress", [
    address,
    { limit: 10 },
  ]);
  if (!sigs?.length) return [];

  const items = await Promise.all(
    sigs
      .filter((s) => !s.err)
      .map(async (s) => {
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
  );
  return items.flat();
}

// Recent wallet activity across every tracked chain, newest first. Spam is
// filtered with the same allowlist the portfolio uses, so a dusting airdrop
// never appears here either.
export async function fetchActivity(
  evm?: string,
  solana?: string,
  limit = 40
): Promise<ActivityItem[]> {
  if (!evm && !solana) return [];
  const [rwa, registries, actions] = await Promise.all([
    fetchRwaRegistry().catch((): RwaRegistry => ({})),
    fetchBuyableRegistry().catch(() => ({ buyable: {}, meme: {} })),
    fetchActionRegistry().catch((): ActionRegistry => ({})),
  ]);

  const evmItems: ActivityItem[] = [];
  if (evm) {
    const batches = await Promise.all(
      EVM_NETWORKS.flatMap((network) =>
        (["in", "out"] as const).map(async (direction) => ({
          network,
          direction,
          transfers: await evmTransfers(network, evm, direction).catch(() => []),
        }))
      )
    );

    for (const { network, direction, transfers } of batches) {
      for (const [index, t] of transfers.entries()) {
        const contract = t.rawContract?.address ?? null;
        // Both external and internal transfers carry native ETH (only erc20 is a
        // token), so both count as native for the holdings allowlist.
        const isNative = t.category === "external" || t.category === "internal";
        if (!isAllowedHolding(network, contract, isNative, rwa, registries.buyable)) continue;
        const amount = typeof t.value === "number" ? t.value : 0;
        if (amount <= 0 || !t.hash) continue;
        const counterparty = (direction === "in" ? t.from : t.to) ?? null;
        evmItems.push({
          // Prefer Alchemy's uniqueId; fall back to a per-transfer composite so
          // two transfers of the same token in one tx never share a React key.
          // Always keyed by direction: a self-transfer log matches both the in
          // and out queries with the same uniqueId, and we render both.
          id: `${direction}:${t.uniqueId ?? `${t.hash}:${contract ?? "native"}:${network}:${index}`}`,
          hash: t.hash,
          network,
          direction,
          symbol: t.asset ?? "",
          amount,
          timestamp: Date.parse(t.metadata?.blockTimestamp ?? "") || 0,
          counterparty,
          logo: tokenLogo(network, contract),
          action: actionFor(actions, network, counterparty, direction),
        });
      }
    }
  }

  const solanaItems = solana
    ? await solanaActivity(solana, rwa, registries.buyable).catch(() => [])
    : [];

  return [...evmItems, ...solanaItems]
    .filter((i) => i.symbol)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}
