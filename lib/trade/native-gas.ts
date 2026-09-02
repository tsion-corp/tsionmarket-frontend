import { formatUnits } from "viem";
import { isReceiptChain, publicClientForChain } from "@/lib/trade/receipt";
import { getSponsoredEvmChainByNetwork } from "@/lib/trade/sponsored-evm";

// A plain native transfer is exactly this much gas. Nothing is estimated: the
// send is value-only with no calldata, so the number is fixed by the protocol.
const NATIVE_TRANSFER_GAS = 21_000n;

// Gas price is read a moment before the send and can rise before inclusion, so
// the reserve carries half again on top. Under-reserving fails the transaction;
// over-reserving by this much is fractions of a cent on any of these chains.
const HEADROOM_NUMERATOR = 3n;
const HEADROOM_DENOMINATOR = 2n;

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
  const gasPrice = await publicClientForChain(target.chainId).getGasPrice();
  const wei = (NATIVE_TRANSFER_GAS * gasPrice * HEADROOM_NUMERATOR) / HEADROOM_DENOMINATOR;
  return Number(formatUnits(wei, NATIVE_DECIMALS));
}
