import type { EIP1193Provider, SignedAuthorization } from "viem";

/**
 * What the app needs from "the wallet that signs": the same methods it has always
 * called on the Decane wallet, so Decane can be handed through unchanged and the new
 * self-custody wallet can stand in for it. Anything that signs goes through this and
 * never reaches for a particular wallet.
 */
export interface SendTransactionRequest {
  chain: string;
  to: string;
  value?: bigint;
  data?: string;
  gasLimit?: bigint;
  gasPrice?: bigint;
}

export interface WalletSigner {
  /** "custom" for the self-custody wallet; absent on the Decane wallet, which is passed through as it is. */
  readonly kind?: "custom";
  isConnected: boolean;
  isUnlocked: boolean;
  addresses: { evm?: string; solana?: string; tron?: string } | null;
  unlock(): Promise<void>;
  /** EVM: an EIP-191 personal_sign (0x hex). Solana: the signature, base58-encoded. */
  signMessage(chain: string, message: string | Uint8Array): Promise<string>;
  /** A plain user-paid transaction; resolves to its hash. */
  sendTransaction(request: SendTransactionRequest): Promise<string>;
  signSolanaTransaction(transaction: Uint8Array): Promise<Uint8Array>;
  signAuthorization(request: {
    chainId: number;
    address?: string;
    contractAddress?: string;
    nonce: number;
  }): Promise<SignedAuthorization>;
  getEthereumProvider(options?: { chainId?: number }): EIP1193Provider;
}

/** The wallet exists but is locked: the person has to unlock it, which only they can do. */
export class WalletLockedError extends Error {
  constructor() {
    super("Your new wallet is locked. Unlock it to continue.");
    this.name = "WalletLockedError";
  }
}

/** The new wallet is the one in use, but it has not loaded yet. Nothing is signed meanwhile. */
export class WalletNotReadyError extends Error {
  constructor() {
    super("Your new wallet isn't ready yet. Try again in a moment.");
    this.name = "WalletNotReadyError";
  }
}
