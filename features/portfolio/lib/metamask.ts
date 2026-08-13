"use client";

interface InjectedProvider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  isMetaMask?: boolean;
  providers?: InjectedProvider[];
}

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

// Prompts MetaMask (EIP-747 wallet_watchAsset) to track KASH. Talks to the
// extension directly, independent of the user's Privy session or embedded
// wallet, so it works whether or not they're otherwise connected.
export async function addKashToMetaMask(tokenAddress: string): Promise<void> {
  const provider = getMetaMaskProvider();
  if (!provider) throw new MetaMaskUnavailableError();

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
          image: `${window.location.origin}/kash-coin.jpg`,
        },
      },
    });
  } catch (error) {
    if ((error as { code?: number })?.code === 4001) throw new MetaMaskDeclinedError();
    throw error;
  }
  if (!added) throw new MetaMaskDeclinedError();
}
