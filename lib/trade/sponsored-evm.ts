import { defineChain, type Chain } from "viem";
import * as viemChains from "viem/chains";
import sponsoredEvmRegistry from "@/config/alchemy-bso-evm-networks.json";

export interface SponsoredEvmChainConfig {
  chainId: number;
  network: string;
  policyNetwork: string;
  alchemyHost: string;
  chain: Chain;
  supportsReceiptPolling: boolean;
  // Whether this network is enabled by the active ZeroDev gas policy. Registry
  // membership alone only means the app knows how to read the chain.
  gasPolicy: boolean;
}

interface SponsoredEvmRegistryEntry {
  network: string;
  policyNetwork: string;
  alchemyHost: string;
  chainKey: keyof typeof viemChains | null;
  chainId?: number;
  name?: string;
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
  gasPolicy?: boolean;
}

function chainFromRegistryEntry(entry: SponsoredEvmRegistryEntry): Chain {
  if (entry.chainKey) {
    const chain = viemChains[entry.chainKey];
    if (!chain) {
      throw new Error(`Missing viem chain export for ${entry.network} (${entry.chainKey}).`);
    }
    return chain as Chain;
  }

  if (!entry.chainId || !entry.name || !entry.nativeCurrency) {
    throw new Error(`Missing custom chain metadata for ${entry.network}.`);
  }

  return defineChain({
    id: entry.chainId,
    name: entry.name,
    nativeCurrency: entry.nativeCurrency,
    rpcUrls: {
      default: { http: [`https://${entry.alchemyHost}/v2`] },
      public: { http: [`https://${entry.alchemyHost}/v2`] },
    },
  });
}

export const SPONSORED_EVM_CHAINS: readonly SponsoredEvmChainConfig[] = (
  sponsoredEvmRegistry as SponsoredEvmRegistryEntry[]
).map((entry) => {
  const chain = chainFromRegistryEntry(entry);
  return {
    chainId: chain.id,
    network: entry.network,
    policyNetwork: entry.policyNetwork,
    alchemyHost: entry.alchemyHost,
    chain,
    supportsReceiptPolling: entry.chainKey !== null,
    gasPolicy: entry.gasPolicy ?? false,
  };
});

const BY_CHAIN_ID = new Map(SPONSORED_EVM_CHAINS.map((config) => [config.chainId, config]));
const BY_NETWORK = new Map(SPONSORED_EVM_CHAINS.map((config) => [config.network, config]));
const BY_POLICY_NETWORK = new Map(
  SPONSORED_EVM_CHAINS.map((config) => [config.policyNetwork, config])
);

export function getSponsoredEvmChainById(chainId: number): SponsoredEvmChainConfig | null {
  return BY_CHAIN_ID.get(chainId) ?? null;
}

export function getSponsoredEvmChainByNetwork(network: string): SponsoredEvmChainConfig | null {
  return BY_NETWORK.get(network) ?? null;
}

export function isSponsoredEvmChainId(chainId: number): boolean {
  return BY_CHAIN_ID.has(chainId);
}

export function isSponsoredEvmNetwork(network: string): boolean {
  return BY_NETWORK.has(network);
}

export function getSponsoredEvmChainByPolicyNetwork(
  policyNetwork: string
): SponsoredEvmChainConfig | null {
  return BY_POLICY_NETWORK.get(policyNetwork) ?? null;
}

// Whether sponsorship will actually work here, as opposed to the chain merely
// being sponsorable. Callers deciding whether to take the bundler path, or
// whether a wallet needs its own native gas, want this rather than mere
// registry membership.
export function hasGasPolicyForNetwork(network: string): boolean {
  return BY_NETWORK.get(network)?.gasPolicy ?? false;
}

export function hasGasPolicyForChainId(chainId: number): boolean {
  return BY_CHAIN_ID.get(chainId)?.gasPolicy ?? false;
}
