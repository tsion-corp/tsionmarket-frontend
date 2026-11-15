import { ARBITRUM_CHAIN_ID, ARBISCAN, type EvmCall } from "./bridge";

/**
 * Paying for Kash from a wallet in the browser (MetaMask and the like), the way Intertrain's own
 * wallet does it. The app's money settles on Base, so the USDC on Arbitrum that buys Kash is
 * usually in a wallet of the person's own. It connects, switches to Arbitrum, and the person
 * confirms each transaction there and pays its small gas in ETH. Nothing here holds a key.
 */

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const ARBITRUM_HEX = `0x${ARBITRUM_CHAIN_ID.toString(16)}`;

export function browserWalletAvailable(): boolean {
  return typeof window !== "undefined" && Boolean((window as { ethereum?: unknown }).ethereum);
}

function provider(): Eip1193 {
  const eth =
    typeof window === "undefined" ? undefined : (window as { ethereum?: Eip1193 }).ethereum;
  if (!eth) {
    throw new Error(
      "No wallet found. Install MetaMask, or open this page in your wallet's browser."
    );
  }
  return eth;
}

/** Makes sure the wallet is on Arbitrum One, adding the network if it does not know it. */
export async function switchToArbitrum(): Promise<void> {
  const eth = provider();
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ARBITRUM_HEX }],
    });
  } catch (error) {
    if ((error as { code?: number })?.code !== 4902) throw error;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: ARBITRUM_HEX,
          chainName: "Arbitrum One",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://arb1.arbitrum.io/rpc"],
          blockExplorerUrls: [ARBISCAN],
        },
      ],
    });
  }
}

/** Asks the wallet for an account, on Arbitrum. */
export async function connectBrowserWallet(): Promise<`0x${string}`> {
  const accounts = (await provider().request({ method: "eth_requestAccounts" })) as string[];
  const account = accounts[0];
  if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) throw new Error("No account was shared.");
  await switchToArbitrum();
  return account as `0x${string}`;
}

/** The wallet asks the person to confirm, then sends. Resolves to the hash once it is submitted. */
export async function sendFromBrowserWallet(
  from: `0x${string}`,
  call: EvmCall
): Promise<`0x${string}`> {
  await switchToArbitrum();
  const hash = await provider().request({
    method: "eth_sendTransaction",
    params: [{ from, to: call.to, data: call.data }],
  });
  if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error("The wallet did not send the transaction.");
  }
  return hash as `0x${string}`;
}
