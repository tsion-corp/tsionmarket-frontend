import { hasGasPolicyForNetwork } from "@/lib/trade/sponsored-evm";

// Gas headroom for selling a chain's native token. A native-token sell spends
// the same asset that pays the network fee, so sending the full balance leaves
// nothing for gas and the wallet rejects the transaction. Holding back a small
// buffer keeps a "max" sell payable.
//
// Chains with a Gas Manager policy are absent on purpose: their sends route
// through the 7702 + bundler path, so the wallet never needs native gas there
// and the full balance is sellable. A chain that is merely in the sponsorship
// registry does not qualify, because without a policy its sends are paid by
// the user like anywhere else. Values are in native units, sized to cover a
// simple transfer with room for fee spikes while staying negligible next to any
// realistic balance.
const NATIVE_GAS_BUFFER: Record<string, number> = {
  "eth-mainnet": 0.0003,
  "arb-mainnet": 0.0003,
  "opt-mainnet": 0.0003,
  "polygon-mainnet": 0.01,
  // A simple HyperEVM transfer costs a small fraction of a cent, but HYPE is
  // worth tens of dollars, so the percentage fallback below would hold back
  // several dollars of a balance to cover it. Sized absolutely instead, with
  // room for a fee spike and still under a dime.
  "hyperliquid-mainnet": 0.001,
};

// A chain nobody has sized yet still has to leave something for the fee, so it
// holds back a small share of the balance rather than nothing at all. This is a
// backstop, not a good answer: on a chain whose native token is worth tens of
// dollars it reserves far more than the fee costs, so a chain people actually
// hold belongs in the map above with a measured value.
const UNSIZED_BUFFER_RATIO = 0.01;

// Solana sends go through the platform's own gas sponsor, not the EVM bundler,
// so a full-balance SOL sell stays payable.
const SOLANA_NETWORK = "solana-mainnet";

// How much of `network`'s native token to hold back when selling it. Zero for
// contract tokens (their gas is paid in the native token, not the sold asset)
// and for chains where sends are sponsored. A null asset address marks the
// chain's native token, matching TokenBalance and SellPayload.
export function gasBufferFor(network: string, assetAddress: string | null, balance = 0): number {
  if (assetAddress !== null) return 0;
  if (network === SOLANA_NETWORK) return 0;
  if (hasGasPolicyForNetwork(network)) return 0;
  const sized = NATIVE_GAS_BUFFER[network];
  return sized ?? balance * UNSIZED_BUFFER_RATIO;
}

// The largest amount of a holding that can actually be sold: the balance,
// minus the gas buffer when the sold asset is the chain's own gas token.
export function maxSellable(network: string, assetAddress: string | null, balance: number): number {
  return Math.max(0, balance - gasBufferFor(network, assetAddress, balance));
}
