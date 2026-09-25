import { createPublicClient, http, type Chain } from "viem";
import { authHeaders } from "@/lib/api";
import { SPONSORED_EVM_CHAINS } from "@/lib/trade/sponsored-evm";

// Read client per chain for confirming transactions. Reads must go through a
// client pinned to the transaction's chain, never the embedded wallet's ambient
// provider: Privy can leave that provider pointed at a different chain, so a
// receipt would be polled on the wrong chain and never found, timing the flow
// out even though the transaction landed.
//
// The network slug rides along so the client can be pointed at our own proxy.
const READ_CHAINS: Record<number, { chain: Chain; network: string }> = Object.fromEntries(
  SPONSORED_EVM_CHAINS.filter((config) => config.supportsReceiptPolling).map((config) => [
    config.chainId,
    { chain: config.chain, network: config.network },
  ])
);

// Cap the wait so a genuinely stuck transaction surfaces an error instead of
// hanging the flow. Fast L2 blocks (~2s) confirm well inside this.
const RECEIPT_TIMEOUT_MS = 90_000;
const RECEIPT_POLL_MS = 5_000;
const READ_TRANSPORT_CONFIG = {
  batch: { batchSize: 25, wait: 16 },
  retryCount: 0,
  timeout: 10_000,
} as const;

// Whether a read client exists for this chain, so callers can decide to wait for
// a receipt rather than call publicClientForChain and catch a throw.
export function isReceiptChain(chainId: number): boolean {
  return chainId in READ_CHAINS;
}

// Reads go through our own proxy on the paid Alchemy key first, with the public
// node above as the fallback. `http()` with no URL would use the chain's default
// public endpoint, which is shared and rate-limited, and this carries every
// on-chain read in the app. viem's fallback transport moves to the backup the
// moment the primary errors, so a proxy outage degrades to a slower public node
// instead of stalling the flow.
//
// The proxy verifies the caller's session, and a Decane session sets no
// cookie, so the bearer is attached per request through viem's fetch hook.
// Browser-only by construction: every caller runs in a hook or an event
// handler.
const authedFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(await authHeaders("current"))) {
    headers.set(name, value);
  }
  return fetch(input, { ...init, headers });
};

// Reads go through the same-origin proxy on the paid key. Keeping ONE transport
// prevents a receipt poll from silently falling back to a public provider.
//
// The proxy verifies the caller's session, and a Decane session sets no cookie,
// so the bearer is attached per request through viem's fetch hook. Browser-only
// by construction: every caller runs in a hook or an event handler.
function createChainReadClient(entry: { chain: Chain; network: string }) {
  return createPublicClient({
    chain: entry.chain,
    transport: http(`/api/evm-rpc/${entry.network}`, {
      ...READ_TRANSPORT_CONFIG,
      fetchFn: authedFetch,
    }),
  });
}

export type ChainReadClient = ReturnType<typeof createChainReadClient>;

// Reusing clients lets viem combine same-tick reads into one JSON-RPC batch.
// It also avoids creating an independent retry scheduler for every hook call.
const READ_CLIENTS = new Map<number, ChainReadClient>();

export function publicClientForChain(chainId: number): ChainReadClient {
  const entry = READ_CHAINS[chainId];
  if (!entry) throw new Error(`This chain isn't supported yet (${chainId}).`);
  const existing = READ_CLIENTS.get(chainId);
  if (existing) return existing;
  const client = createChainReadClient(entry);
  READ_CLIENTS.set(chainId, client);
  return client;
}

// Waits for a transaction to confirm on its own chain. `label` names the step so
// a timeout or revert reports the step that actually failed rather than a
// generic or misattributed message.
// Returns the confirmed receipt so a caller that needs something out of the
// logs, such as the gameId a factory emitted, can read it without paying for a
// second round trip. Callers that only care that it landed ignore the value.
export async function awaitReceipt(
  client: ChainReadClient,
  hash: string,
  label: string
): Promise<Awaited<ReturnType<ChainReadClient["waitForTransactionReceipt"]>>> {
  let receipt;
  try {
    receipt = await client.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      timeout: RECEIPT_TIMEOUT_MS,
      pollingInterval: RECEIPT_POLL_MS,
    });
  } catch {
    throw new Error(
      `${label} is taking longer than usual to confirm. Check your wallet, then try again.`
    );
  }
  if (receipt.status === "reverted") {
    throw new Error(`${label} failed on-chain. Try again.`);
  }
  return receipt;
}
