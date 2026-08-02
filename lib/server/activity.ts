import "server-only";
import {
  EVM_NETWORKS,
  SOLANA_NETWORK,
  isAllowedHolding,
  isRateLimitError,
} from "@/lib/server/alchemy";
import { fetchRwaRegistry } from "@/lib/server/rwa-registry";
import { fetchBuyableRegistry } from "@/lib/server/buyable-registry";

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
}

interface RawTransfer {
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

// One direction of transfers on one network. Alchemy indexes sends and
// receives separately, so each network costs two calls.
async function evmTransfers(
  network: string,
  address: string,
  direction: ActivityDirection
): Promise<RawTransfer[]> {
  const filter: Record<string, unknown> = {
    category: ["external", "erc20"],
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

// Solana has no asset-transfer index, so recent signatures carry the entry and
// the native balance delta gives its amount. Token-account changes are left to
// the explorer link rather than guessed at.
async function solanaActivity(address: string): Promise<ActivityItem[]> {
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
          meta?: { preBalances?: number[]; postBalances?: number[] };
          transaction?: { message?: { accountKeys?: (string | { pubkey?: string })[] } };
        }>(SOLANA_NETWORK, "getTransaction", [
          s.signature,
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
        ]);

        const keys = (tx?.transaction?.message?.accountKeys ?? []).map((k) =>
          typeof k === "string" ? k : (k?.pubkey ?? "")
        );
        const index = keys.indexOf(address);
        const pre = tx?.meta?.preBalances?.[index];
        const post = tx?.meta?.postBalances?.[index];
        if (index < 0 || pre == null || post == null) return null;

        const deltaLamports = post - pre;
        if (deltaLamports === 0) return null;
        const item: ActivityItem = {
          id: s.signature,
          hash: s.signature,
          network: SOLANA_NETWORK,
          direction: deltaLamports > 0 ? "in" : "out",
          symbol: "SOL",
          amount: Math.abs(deltaLamports) / 1e9,
          timestamp: (s.blockTime ?? 0) * 1000,
          counterparty: null,
        };
        return item;
      })
  );
  return items.filter((i): i is ActivityItem => i !== null);
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
  const [rwa, registries] = await Promise.all([
    fetchRwaRegistry().catch(() => ({})),
    fetchBuyableRegistry().catch(() => ({ buyable: {}, meme: {} })),
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
      for (const t of transfers) {
        const contract = t.rawContract?.address ?? null;
        const isNative = t.category === "external";
        if (!isAllowedHolding(network, contract, isNative, rwa, registries.buyable)) continue;
        const amount = typeof t.value === "number" ? t.value : 0;
        if (amount <= 0 || !t.hash) continue;
        evmItems.push({
          id: `${t.hash}:${direction}:${contract ?? "native"}`,
          hash: t.hash,
          network,
          direction,
          symbol: t.asset ?? "",
          amount,
          timestamp: Date.parse(t.metadata?.blockTimestamp ?? "") || 0,
          counterparty: (direction === "in" ? t.from : t.to) ?? null,
        });
      }
    }
  }

  const solanaItems = solana ? await solanaActivity(solana).catch(() => []) : [];

  return [...evmItems, ...solanaItems]
    .filter((i) => i.symbol)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}
