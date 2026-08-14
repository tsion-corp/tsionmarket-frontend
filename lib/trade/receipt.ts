import { createPublicClient, fallback, http, type Chain } from "viem";
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
const RECEIPT_TIMEOUT_MS = 120_000;
const RECEIPT_POLL_MS = 2_000;

// Whether a read client exists for this chain, so callers can decide to wait for
// a receipt rather than call publicClientForChain and catch a throw.
export function isReceiptChain(chainId: number): boolean {
  return chainId in READ_CHAINS;
}

// A public node per chain, used only as a backup. The chain's default RPC is
// flaky for some networks and ISPs, SSL resets included, and a receipt that
// cannot be read stalls the whole flow even though the transaction landed.
const FALLBACK_RPCS: Record<number, string> = {
  8453: "https://base-rpc.publicnode.com",
  42161: "https://arbitrum-one-rpc.publicnode.com",
  137: "https://polygon-bor-rpc.publicnode.com",
  10: "https://optimism-rpc.publicnode.com",
};

// Reads go through our own proxy on the paid Alchemy key first, with the public
// node above as the fallback. `http()` with no URL would use the chain's default
// public endpoint, which is shared and rate-limited, and this carries every
// on-chain read in the app. viem's fallback transport moves to the backup the
// moment the primary errors, so a proxy outage degrades to a slower public node
// instead of stalling the flow.
//
// The proxy is same-origin, so the privy-token cookie authenticates it with no
// header plumbing. Browser-only by construction: every caller runs in a hook or
// an event handler.
export function publicClientForChain(chainId: number) {
  const entry = READ_CHAINS[chainId];
  if (!entry) throw new Error(`This chain isn't supported yet (${chainId}).`);
  const primary = http(`/api/evm-rpc/${entry.network}`);
  const backup = FALLBACK_RPCS[chainId];
  return createPublicClient({
    chain: entry.chain,
    transport: backup ? fallback([primary, http(backup)]) : primary,
  });
}

// Inferred so it tracks the app's viem version (a second copy is bundled by
// other deps, and naming the exported PublicClient type collides with it).
export type ChainReadClient = ReturnType<typeof publicClientForChain>;

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
