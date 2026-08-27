import { NETWORK_TO_CHAIN } from "@/lib/sell";

// Building a share link for a trade needs the Alchemy network id, because that
// is what the activity rows already put in a trade deep link. The trade flows
// only know the numeric chain id, so this inverts the table rather than
// keeping a second copy of it: two lists of chains drift, and the one that
// drifts silently produces a link to the wrong explorer.
const CHAIN_TO_NETWORK: Record<number, string> = Object.fromEntries(
  Object.entries(NETWORK_TO_CHAIN).map(([network, chainId]) => [chainId, network])
);

export function networkForChainId(chainId: number): string | null {
  return CHAIN_TO_NETWORK[chainId] ?? null;
}

// A transaction hash, as the chains we settle on write them. Anything else is
// not a hash we can point at, and a share is better withheld than pointed at
// something that will not resolve.
const EVM_HASH = /^0x[0-9a-fA-F]{64}$/;
// Solana signatures are base58 and variable length, so they are matched by
// shape rather than by an exact size.
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

function isSettledHash(hash: string): boolean {
  return EVM_HASH.test(hash) || SOLANA_SIGNATURE.test(hash);
}

/**
 * The `trade` deep link ref for a settled trade, or null when one cannot be
 * built honestly.
 *
 * Same `<network>:<hash>` shape the activity rows use, so a trade shared from
 * the confirmation and the same trade shared later from the activity list
 * produce the same link. Returns null on an unknown chain or a hash that is
 * not one, because a share control that produces a dead link is worse than no
 * share control: the person believes they posted something openable.
 */
export function tradeShareRef(chainId: number | null, txHash: string | null): string | null {
  if (chainId == null || !txHash) return null;
  const network = networkForChainId(chainId);
  if (!network) return null;
  const hash = txHash.trim();
  return isSettledHash(hash) ? `${network}:${hash}` : null;
}
