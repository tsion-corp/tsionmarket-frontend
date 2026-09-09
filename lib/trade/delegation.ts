// EIP-7702 delegation status per wallet and chain.
//
// A wallet delegates once and stays delegated, so the code read that checks
// for it is worth exactly one round trip per wallet per chain for the life of
// the page. Before this memo every sponsored send paid for it, and an
// approval-then-swap trade paid twice.

const SIMPLE_7702_IMPL = "0xe6Cae83BdE06E4c305530e199D7217f42808555B" as const;

export const SIMPLE_7702_IMPLEMENTATION = SIMPLE_7702_IMPL;

type ReadRequest = (args: { method: string; params: unknown }) => Promise<unknown>;

const delegated = new Set<string>();

function key(chainId: number, address: `0x${string}`): string {
  return `${chainId}:${address.toLowerCase()}`;
}

export function isDelegationKnown(chainId: number, address: `0x${string}`): boolean {
  return delegated.has(key(chainId, address));
}

// Called once a send that carried an authorization has its receipt: the
// delegation is on-chain from that block on.
export function rememberDelegated(chainId: number, address: `0x${string}`): void {
  delegated.add(key(chainId, address));
}

export function forgetDelegations(): void {
  delegated.clear();
}

// Answers whether the wallet already runs the shared 7702 implementation,
// reading the chain only when the answer is not already known.
export async function isDelegated(
  read: ReadRequest,
  chainId: number,
  address: `0x${string}`
): Promise<boolean> {
  if (isDelegationKnown(chainId, address)) return true;
  const code = (await read({ method: "eth_getCode", params: [address, "latest"] })) as string;
  const yes = code.toLowerCase() === `0xef0100${SIMPLE_7702_IMPL.slice(2).toLowerCase()}`;
  if (yes) rememberDelegated(chainId, address);
  return yes;
}
