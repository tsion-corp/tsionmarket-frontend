import type { EIP1193Provider } from "viem";
import { WalletNotReadyError, type WalletSigner } from "./types";

/**
 * What the app is handed while the self-custody wallet is the one in use but is not
 * loaded yet. It signs nothing and reports no address: the app waits rather than
 * quietly falling back to a different wallet, which would send money from an account
 * the person did not mean.
 */
const refuse = async (): Promise<never> => {
  throw new WalletNotReadyError();
};

export const PENDING_SIGNER: WalletSigner = {
  kind: "custom",
  isConnected: false,
  isUnlocked: false,
  addresses: null,
  unlock: refuse,
  signMessage: refuse,
  sendTransaction: refuse,
  signSolanaTransaction: refuse,
  signAuthorization: refuse,
  getEthereumProvider: () =>
    ({
      request: refuse,
      on: () => undefined,
      removeListener: () => undefined,
    }) as unknown as EIP1193Provider,
};
