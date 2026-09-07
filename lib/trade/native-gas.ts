import { formatUnits } from "viem";
import { isReceiptChain, publicClientForChain } from "@/lib/trade/receipt";
import { getSponsoredEvmChainByNetwork } from "@/lib/trade/sponsored-evm";

// A plain native transfer is at least this much gas: the protocol minimum for
// a value-only send with no calldata. It is a floor, not the answer. On an
// Arbitrum Orbit chain (ApeChain, Arbitrum itself) the gas a transfer is
// charged includes the L1 posting component, so the node's estimate runs well
// above 21000 and a reserve built on 21000 leaves the send short: "gas
// required exceeds allowance", selling APE on 2026-09-07. The reserve is
// therefore measured from the node's own estimate of a transfer and floored
// here; a node that will not estimate falls back to the floor.
const NATIVE_TRANSFER_GAS = 21_000n;

// Any destination will do for the estimate: a value-only transfer to an
// externally owned address costs the same wherever it goes.
const ESTIMATE_RECIPIENT = "0x000000000000000000000000000000000000dEaD" as const;

// Gas price is read a moment before the send and can rise before inclusion, so
// the reserve carries half again on top. Under-reserving fails the transaction;
// over-reserving by this much is fractions of a cent on any of these chains.
const HEADROOM_NUMERATOR = 5n;
const HEADROOM_DENOMINATOR = 4n;

// What the wallet will actually set as its fee cap on an EIP-1559 chain, and
// what the node checks the balance against: twice the base fee plus the tip.
// "gas required exceeds allowance (15876)" selling APE on 2026-09-07 was
// exactly this: the reserve had been sized at the spot gas price, and the
// implied fee in the node's answer was twice the base fee to the digit. A
// chain without a base fee (legacy fees) is capped at its gas price.
const BASE_FEE_MULTIPLIER = 2n;

// Native tokens are 18 decimals on every EVM chain we hold balances on.
const NATIVE_DECIMALS = 18;

// What it actually costs to send this chain's native token right now, in whole
// units. Replaces a guessed reserve with a measured one, so selling "max" can
// leave behind the fee instead of a round number chosen in advance.
export async function nativeSendCost(network: string): Promise<number> {
  const target = getSponsoredEvmChainByNetwork(network);
  if (!target || !isReceiptChain(target.chainId)) {
    throw new Error(`No read node for ${network}.`);
  }
  const client = publicClientForChain(target.chainId);
  const [gasPrice, estimated, block, tip] = await Promise.all([
    client.getGasPrice(),
    client.estimateGas({ to: ESTIMATE_RECIPIENT, value: 0n }).catch((error: unknown) => {
      console.warn(
        `nativeSendCost: ${network} would not estimate a transfer; using the floor`,
        error
      );
      return NATIVE_TRANSFER_GAS;
    }),
    client.getBlock({ blockTag: "latest" }).catch(() => ({ baseFeePerGas: null })),
    client.estimateMaxPriorityFeePerGas().catch(() => 0n),
  ]);
  const gas = estimated > NATIVE_TRANSFER_GAS ? estimated : NATIVE_TRANSFER_GAS;
  const baseFee = block.baseFeePerGas ?? null;
  const feeCap = baseFee !== null ? baseFee * BASE_FEE_MULTIPLIER + tip : gasPrice;
  const fee = feeCap > gasPrice ? feeCap : gasPrice;
  const wei = (gas * fee * HEADROOM_NUMERATOR) / HEADROOM_DENOMINATOR;
  return Number(formatUnits(wei, NATIVE_DECIMALS));
}
