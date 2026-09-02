import { defineChain, type Chain } from "viem";
import {
  abstract,
  avalanche,
  blast,
  gnosis,
  linea,
  ronin,
  scroll,
  zksync,
  zora,
} from "viem/chains";
import { SPONSORED_EVM_CHAINS } from "@/lib/trade/sponsored-evm";

// Chain ids are not unique across viem's catalogue: 999 is claimed by HyperEVM,
// Zora Goerli Testnet and Wanchain Testnet. Handed only the number, the wallet
// picked Zora Goerli and sent a HyperEVM sell's reads to testnet.rpc.zora.energy,
// which fails because the account does not exist there. Naming the chains
// removes the guess.

// Mythos is not in viem's catalogue, so it is defined here rather than left out:
// a sellable chain the wallet has never heard of is the same failure with a
// different id.
const mythos = defineChain({
  id: 42018,
  name: "Mythos",
  nativeCurrency: { name: "Mythos", symbol: "MYTH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mythicalgames.com/eth"] } },
});

// Sellable chains that carry no sponsorship policy and are therefore absent from
// the sponsorship registry. They still need naming, because a holding on one can
// be sold.
const UNSPONSORED_CHAINS: readonly Chain[] = [
  gnosis,
  linea,
  zksync,
  scroll,
  avalanche,
  blast,
  zora,
  ronin,
  abstract,
  mythos,
];

// Every EVM chain the wallet is told about. The registry supplies the sponsorable
// ones; the list above supplies the rest.
export const WALLET_CHAINS: readonly Chain[] = [
  ...SPONSORED_EVM_CHAINS.map((config) => config.chain),
  ...UNSPONSORED_CHAINS,
];
