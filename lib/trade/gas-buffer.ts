import { isSponsoredEvmNetwork } from "@/lib/trade/sponsored-evm";

// Gas headroom for selling a chain's native token. A native-token sell spends
// the same asset that pays the network fee, so sending the full balance leaves
// nothing for gas and the wallet rejects the transaction. Holding back a small
// buffer keeps a "max" sell payable.
//
// Sponsored EVM chains are absent on purpose: their sends route through the
// 7702 + bundler path, so the wallet never needs native gas there and the full
// balance is sellable. Values are in native units, sized to cover a simple
// transfer with room for fee spikes while staying negligible next to any realistic balance.
const NATIVE_GAS_BUFFER: Record<string, number> = {
  "eth-mainnet": 0.0003,
  "arb-mainnet": 0.0003,
  "opt-mainnet": 0.0003,
  "polygon-mainnet": 0.01,
};

// How much of `network`'s native token to hold back when selling it. Zero for
// contract tokens (their gas is paid in the native token, not the sold asset)
// and for chains where sends are sponsored. A null asset address marks the
// chain's native token, matching TokenBalance and SellPayload.
export function gasBufferFor(network: string, assetAddress: string | null): number {
  if (assetAddress !== null) return 0;
  if (isSponsoredEvmNetwork(network)) return 0;
  return NATIVE_GAS_BUFFER[network] ?? 0;
}

// The largest amount of a holding that can actually be sold: the balance,
// minus the gas buffer when the sold asset is the chain's own gas token.
export function maxSellable(network: string, assetAddress: string | null, balance: number): number {
  return Math.max(0, balance - gasBufferFor(network, assetAddress));
}
