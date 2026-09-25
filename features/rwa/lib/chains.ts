import { isReceiptChain } from "@/lib/trade/receipt";
import type { RwaChain } from "@/lib/rwa/catalog";

// EVM chain ids per RWA chain. Without an explicit chainId, Privy defaults to
// Ethereum mainnet (1), so a non-Ethereum RWA buy would be signed on the wrong
// chain and fail with "insufficient funds for gas".
//
// It lives here rather than beside the executor because two callers need the
// same answer: the executor, to sign on the right chain, and Shine, to decide
// whether this chain gives the app a confirmation at all. A second copy of the
// map would drift, and the direction it drifted in would decide whether a post
// claims something the app never saw.
export const RWA_EVM_CHAIN_ID: Partial<Record<RwaChain, number>> = {
  ethereum: 1,
  base: 8453,
  arbitrum: 42161,
  bsc: 56,
  polygon: 137,
};

/**
 * Whether executing on this chain actually waits for a confirmation.
 *
 * useExecuteRwa awaits a receipt only where there is a pinned read client, and
 * calls everything else best-effort: on those chains its promise resolves on
 * submission alone. Solana is confirmed — the signature's status is polled —
 * so it is the EVM side that splits.
 *
 * ADR-2026-09-24 section 4: Shine posts nothing on a chain that returns false
 * here. A post asserting a confirmation the app did not get is exactly the
 * failure the ADR is trying to avoid, and with no deep link there is nothing
 * to correct it with afterwards.
 */
export function rwaExecutionIsConfirmed(chain: RwaChain): boolean {
  if (chain === "solana") return true;
  const chainId = RWA_EVM_CHAIN_ID[chain];
  return chainId !== undefined && isReceiptChain(chainId);
}
