// Fee estimation for sponsored sends on the paymaster path.
//
// viem estimates a user operation's fees from the chain: eth_maxPriorityFeePerGas
// plus the latest base fee. On Arbitrum the chain answers a priority fee of 0,
// which is correct for the chain and wrong for the bundler: Alchemy's bundler
// enforces its own floor and rejects the operation at precheck
// ("maxPriorityFeePerGas is 0 but must be at least 831187"). It publishes that
// floor as rundler_maxPriorityFeePerGas. The tip is the larger of the chain's
// estimate and the floor with headroom; the max fee doubles the base fee so
// the operation still lands if the base fee rises before inclusion, as
// Alchemy's own guidance recommends.

export const PRIORITY_FEE_BUFFER_PERCENT = 25;
const BASE_FEE_MULTIPLIER = 2n;

export type BundlerRequest = (args: { method: string; params?: unknown[] }) => Promise<unknown>;

export interface FeesPerGas {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

async function bundlerPriorityFloor(request: BundlerRequest): Promise<bigint | null> {
  try {
    const answer = await request({ method: "rundler_maxPriorityFeePerGas", params: [] });
    return typeof answer === "string" && /^0x[0-9a-fA-F]+$/.test(answer) ? BigInt(answer) : null;
  } catch (error) {
    // A bundler that does not publish a floor is not a failure; the chain's
    // own estimate is what it will judge the operation by.
    console.warn("sponsor-fees: bundler published no priority-fee floor", error);
    return null;
  }
}

export async function paymasterFeesPerGas({
  bundlerRequest,
  baseFeePerGas,
  chainPriorityFeePerGas,
}: {
  bundlerRequest: BundlerRequest;
  baseFeePerGas: bigint;
  chainPriorityFeePerGas: bigint;
}): Promise<FeesPerGas> {
  const floor = await bundlerPriorityFloor(bundlerRequest);
  const buffered = floor === null ? 0n : (floor * BigInt(100 + PRIORITY_FEE_BUFFER_PERCENT)) / 100n;
  const maxPriorityFeePerGas =
    chainPriorityFeePerGas > buffered ? chainPriorityFeePerGas : buffered;
  return {
    maxPriorityFeePerGas,
    maxFeePerGas: baseFeePerGas * BASE_FEE_MULTIPLIER + maxPriorityFeePerGas,
  };
}
