"use client";

import { BASE_CHAIN_ID } from "@/lib/deposit";

interface InjectedProvider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  isMetaMask?: boolean;
  providers?: InjectedProvider[];
}

const BASE_CHAIN_ID_HEX = `0x${BASE_CHAIN_ID.toString(16)}`;

// EIP-3085 params for wallet_addEthereumChain, used only when the user's
// MetaMask has never seen Base before (error 4902). The public RPC — same
// fallback the backend uses when KASH_RPC_URL is left unset — is fine here:
// this only needs to be enough for MetaMask to register the network, not to
// carry real traffic.
const BASE_CHAIN_PARAMS = {
  chainId: BASE_CHAIN_ID_HEX,
  chainName: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://mainnet.base.org"],
  blockExplorerUrls: ["https://basescan.org"],
};

// Other wallet extensions inject onto window.ethereum too, and when several
// are installed only providers[] reliably says which one is MetaMask. The
// object at window.ethereum itself may belong to whichever extension loaded
// last.
function getMetaMaskProvider(): InjectedProvider | null {
  const injected = (window as { ethereum?: InjectedProvider }).ethereum;
  if (!injected) return null;
  if (injected.providers?.length) return injected.providers.find((p) => p.isMetaMask) ?? null;
  return injected.isMetaMask ? injected : null;
}

export class MetaMaskUnavailableError extends Error {}
// The user closed or rejected the wallet_watchAsset prompt, not a failure.
export class MetaMaskDeclinedError extends Error {}

const KASH_DECIMALS = 18;

// wallet_watchAsset has no chain parameter of its own — it registers the
// token under whatever network is CURRENTLY ACTIVE in the wallet. KASH only
// exists on Base, so if the user's MetaMask is sitting on a different chain
// (the common case: it defaults to Ethereum mainnet), the token gets added
// there instead, where the contract doesn't exist. Switch first — adding the
// network via EIP-3085 if MetaMask has never seen Base before (error 4902).
async function ensureBaseChain(provider: InjectedProvider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 4001) throw new MetaMaskDeclinedError();
    if ((error as { code?: number })?.code !== 4902) throw error;
    try {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [BASE_CHAIN_PARAMS],
      });
    } catch (addError) {
      if ((addError as { code?: number })?.code === 4001) throw new MetaMaskDeclinedError();
      throw addError;
    }
  }
}

// Prompts MetaMask (EIP-747 wallet_watchAsset) to track KASH. Talks to the
// extension directly, independent of the user's Privy session or embedded
// wallet, so it works whether or not they're otherwise connected.
export async function addKashToMetaMask(tokenAddress: string): Promise<void> {
  const provider = getMetaMaskProvider();
  if (!provider) throw new MetaMaskUnavailableError();

  await ensureBaseChain(provider);

  let added: unknown;
  try {
    added = await provider.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: {
          address: tokenAddress,
          symbol: "KASH",
          decimals: KASH_DECIMALS,
          image: `${window.location.origin}/kash/kash-plus-coin.png`,
        },
      },
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 4001) throw new MetaMaskDeclinedError();
    throw error;
  }
  if (!added) throw new MetaMaskDeclinedError();
}
