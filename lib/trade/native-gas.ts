import { encodeFunctionData, erc20Abi, formatUnits } from "viem";
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

// An ERC-20 transfer costs about three times a native one. Sizing a token
// sale from NATIVE_TRANSFER_GAS asked for a third of the real fee, so a wallet
// topped up to just past the check still failed at the node (USD₮0 on
// HyperEVM). This bounds the GAS UNITS a transfer takes, which is a property
// of the opcode work, not of traffic. The price those units are charged at is
// read live below, and the node's own estimate wins whenever it is higher.
const ERC20_TRANSFER_GAS = 65_000n;

// Any destination will do for the estimate: a value-only transfer to an
// externally owned address costs the same wherever it goes.
const ESTIMATE_RECIPIENT = "0x000000000000000000000000000000000000dEaD" as const;

/** The send being priced. Empty means the chain's own native token. */
export interface SendShape {
  tokenAddress?: string | null;
  // The wallet paying: an ERC-20 estimate runs against its real balance.
  from?: string;
  to?: string;
  amount?: bigint;
}

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

export interface NativeSendFee {
  // Gas units the send will be given: the node's estimate, floored.
  gas: bigint;
  // The fee cap per gas the wallet should set, headroom included. On an
  // EIP-1559 chain this is maxFeePerGas (with maxPriorityFeePerGas beside it);
  // on a legacy-fee chain it is the gasPrice, and maxPriorityFeePerGas is 0.
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  eip1559: boolean;
  // gas * maxFeePerGas — what the node checks the balance against.
  feeWei: bigint;
}

// The parameters a user-paid send should carry, measured live. Exposed so a
// caller that has to send the ENTIRE native balance (the migration sweep) can
// set the exact cap and send balance minus gas * cap, which is the one shape
// the node's balance check accepts; leaving the wallet to pick its own fee
// would set a different cap and reject the send as insufficient funds.
export async function nativeSendFeeParams(
  network: string,
  send: SendShape = {}
): Promise<NativeSendFee> {
  const target = getSponsoredEvmChainByNetwork(network);
  if (!target || !isReceiptChain(target.chainId)) {
    throw new Error(`No read node for ${network}.`);
  }
  const client = publicClientForChain(target.chainId);
  const token = send.tokenAddress ?? null;
  const floor = token === null ? NATIVE_TRANSFER_GAS : ERC20_TRANSFER_GAS;
  const request =
    token === null
      ? { to: ESTIMATE_RECIPIENT, value: 0n }
      : {
          to: token as `0x${string}`,
          account: send.from as `0x${string}` | undefined,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [(send.to ?? ESTIMATE_RECIPIENT) as `0x${string}`, send.amount ?? 1n],
          }),
        };
  const [gasPrice, estimated, block, tip] = await Promise.all([
    client.getGasPrice(),
    client.estimateGas(request).catch((error: unknown) => {
      // A wallet short of the fee makes the node revert the estimate, the very
      // case this gates, so fall back to the send's own floor.
      console.warn(
        `nativeSendCost: ${network} would not estimate the send; using the floor`,
        error
      );
      return floor;
    }),
    client.getBlock({ blockTag: "latest" }).catch(() => ({ baseFeePerGas: null })),
    client.estimateMaxPriorityFeePerGas().catch(() => 0n),
  ]);
  const gas = estimated > floor ? estimated : floor;
  const baseFee = block.baseFeePerGas ?? null;
  const feeCap = baseFee !== null ? baseFee * BASE_FEE_MULTIPLIER + tip : gasPrice;
  const fee = feeCap > gasPrice ? feeCap : gasPrice;
  // Headroom on the price, so gas * cap is exactly the balance the node will
  // require, and the total is the same figure nativeSendCost always reported.
  const maxFeePerGas = (fee * HEADROOM_NUMERATOR) / HEADROOM_DENOMINATOR;
  return {
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas: baseFee !== null ? tip : 0n,
    eip1559: baseFee !== null,
    feeWei: gas * maxFeePerGas,
  };
}

// What it actually costs to send this chain's native token right now, in whole
// units. Replaces a guessed reserve with a measured one, so selling "max" can
// leave behind the fee instead of a round number chosen in advance.
export async function nativeSendCost(network: string, send: SendShape = {}): Promise<number> {
  const { feeWei } = await nativeSendFeeParams(network, send);
  return Number(formatUnits(feeWei, NATIVE_DECIMALS));
}

/**
 * Whether a wallet holding `nativeBalance` can pay a fee on this chain.
 *
 * `measuredCost` is what `nativeSendCost` answered for the send being made.
 * "Holds any native at all" was the test before, and dust passed it: a wallet
 * with a fraction of a cent of HYPE reached the node and came back with "gas
 * required exceeds allowance" (staging, 2026-09-12).
 *
 * With no measurement yet the old test stands, so a read that has not answered
 * does not block a wallet holding plenty.
 */
export function canPayNativeFee(nativeBalance: number, measuredCost: number | undefined): boolean {
  if (measuredCost === undefined) return nativeBalance > 0;
  return nativeBalance >= measuredCost;
}
