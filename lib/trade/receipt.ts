import { createPublicClient, http, type Chain } from "viem";
import { SPONSORED_EVM_CHAINS } from "@/lib/trade/sponsored-evm";

// Read client per chain for confirming transactions. Reads must go through a
// client pinned to the transaction's chain, never the embedded wallet's ambient
// provider: Privy can leave that provider pointed at a different chain, so a
// receipt would be polled on the wrong chain and never found, timing the flow
// out even though the transaction landed.
const READ_CHAINS: Record<number, Chain> = Object.fromEntries(
  SPONSORED_EVM_CHAINS.filter((config) => config.supportsReceiptPolling).map((config) => [
    config.chainId,
    config.chain,
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

export function publicClientForChain(chainId: number) {
  const chain = READ_CHAINS[chainId];
  if (!chain) throw new Error(`This chain isn't supported yet (${chainId}).`);
  return createPublicClient({ chain, transport: http() });
}

// Inferred so it tracks the app's viem version (a second copy is bundled by
// other deps, and naming the exported PublicClient type collides with it).
export type ChainReadClient = ReturnType<typeof publicClientForChain>;

// Waits for a transaction to confirm on its own chain. `label` names the step so
// a timeout or revert reports the step that actually failed rather than a
// generic or misattributed message.
export async function awaitReceipt(
  client: ChainReadClient,
  hash: string,
  label: string
): Promise<void> {
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
}
