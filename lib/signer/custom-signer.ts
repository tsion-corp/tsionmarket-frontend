import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { hexToBytes, isAddress, isHex, type EIP1193Provider, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  getUnlockedKey,
  peekUnlocked,
  withAccountKey,
  type WalletPackage,
} from "@/lib/wallet-core";
import { signSolanaTransactionBytes } from "./solana-sign";
import { WalletLockedError, type SendTransactionRequest, type WalletSigner } from "./types";

/**
 * The self-custody wallet as the app's signer.
 *
 * Every signature derives the account key from the unlocked wallet, signs, and lets
 * the key go: nothing here holds a key between calls. A locked wallet signs nothing
 * (WalletLockedError); only the person can unlock it.
 *
 * It speaks the same interface the Decane wallet does, so the app's sends, typed-data
 * signing and sponsored (EIP-7702) flows run on it unchanged.
 */

/** The reads and transaction building a user-paid send needs, for one chain. */
export interface ChainClient {
  getTransactionCount(args: { address: Hex; blockTag: "pending" }): Promise<number>;
  estimateGas(args: { account: Hex; to?: Hex; data?: Hex; value?: bigint }): Promise<bigint>;
  estimateFeesPerGas(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}

export interface CustomSignerDeps {
  uid: string;
  pkg: WalletPackage;
  /** Broadcast a signed transaction on this network; resolves to its hash. */
  broadcast(network: string, raw: Hex): Promise<Hex>;
  client(chainId: number): ChainClient;
  /** The network a chain id is sent on, or null when this wallet does not send there. */
  networkOf(chainId: number): string | null;
}

const MAX_GAS = 10_000_000n;
/** An estimate is a floor, so a little headroom: +20%. */
const withHeadroom = (gas: bigint) => (gas * 12n) / 10n;

/** The reads a dapp may make through the provider. Everything that signs or sends is handled, not passed on. */
const PASSTHROUGH_READS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "net_version",
]);

class ProviderError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function evmChainId(chain: string): number {
  const match = /^evm:(\d+)$/.exec(chain);
  if (!match) throw new Error(`Signing on ${chain} isn't supported by this wallet.`);
  return Number(match[1]);
}

const hexToBigInt = (value: unknown): bigint | undefined =>
  typeof value === "string" && isHex(value) ? BigInt(value) : undefined;

export function createCustomSigner(deps: CustomSignerDeps): WalletSigner {
  const { uid, pkg } = deps;
  const evm = pkg.accounts.find((account) => account.family === "evm");
  const solana = pkg.accounts.find((account) => account.family === "solana");
  const addresses = {
    ...(evm ? { evm: evm.canonicalAddress } : {}),
    ...(solana ? { solana: solana.canonicalAddress } : {}),
  };

  function key(): Uint8Array {
    const dek = getUnlockedKey(uid, pkg.walletId);
    if (!dek) throw new WalletLockedError();
    return dek;
  }

  function withEvmKey<T>(run: (privateKey: Hex) => Promise<T> | T): Promise<T> {
    if (!evm) throw new Error("This wallet has no Ethereum account.");
    return withAccountKey(pkg, key(), evm.accountId, (material) => {
      if (material.family !== "evm")
        throw new Error("This wallet's Ethereum account is not valid.");
      return run(material.privateKey);
    });
  }

  function withSolanaSeed<T>(run: (seed: Uint8Array) => Promise<T> | T): Promise<T> {
    if (!solana) throw new Error("This wallet has no Solana account.");
    return withAccountKey(pkg, key(), solana.accountId, (material) => {
      if (material.family !== "solana")
        throw new Error("This wallet's Solana account is not valid.");
      return run(material.seed);
    });
  }

  const ownsEvm = (value: unknown): boolean =>
    typeof value === "string" &&
    addresses.evm !== undefined &&
    value.toLowerCase() === addresses.evm.toLowerCase();

  async function signMessage(chain: string, message: string | Uint8Array): Promise<string> {
    if (chain.startsWith("evm:")) {
      return withEvmKey((privateKey) =>
        privateKeyToAccount(privateKey).signMessage({
          message: typeof message === "string" ? message : { raw: message },
        })
      );
    }
    if (chain.startsWith("solana")) {
      const bytes = typeof message === "string" ? new TextEncoder().encode(message) : message;
      return withSolanaSeed((seed) => base58.encode(ed25519.sign(bytes, seed)));
    }
    throw new Error(`Signing on ${chain} isn't supported by this wallet.`);
  }

  async function sendTransaction(request: SendTransactionRequest): Promise<string> {
    const chainId = evmChainId(request.chain);
    const network = deps.networkOf(chainId);
    if (!network) throw new Error("This wallet can't send on that network yet.");
    if (!isAddress(request.to)) throw new Error("That isn't a valid address to send to.");
    if (request.data !== undefined && !isHex(request.data))
      throw new Error("That transaction's data isn't valid.");
    const from = addresses.evm as Hex | undefined;
    if (!from) throw new Error("This wallet has no Ethereum account.");

    const client = deps.client(chainId);
    const to = request.to as Hex;
    const data = request.data as Hex | undefined;
    const nonce = await client.getTransactionCount({ address: from, blockTag: "pending" });
    const gas =
      request.gasLimit ??
      withHeadroom(
        await client.estimateGas({
          account: from,
          to,
          ...(data ? { data } : {}),
          ...(request.value !== undefined ? { value: request.value } : {}),
        })
      );
    if (gas <= 0n || gas > MAX_GAS)
      throw new Error("That transaction needs more gas than this wallet will allow.");

    const base = {
      chainId,
      nonce,
      to,
      gas,
      ...(request.value !== undefined ? { value: request.value } : {}),
      ...(data ? { data } : {}),
    };
    const raw = await (async () => {
      if (request.gasPrice !== undefined) {
        return withEvmKey((privateKey) =>
          privateKeyToAccount(privateKey).signTransaction({
            ...base,
            type: "legacy",
            gasPrice: request.gasPrice!,
          })
        );
      }
      const fees = await client.estimateFeesPerGas();
      return withEvmKey((privateKey) =>
        privateKeyToAccount(privateKey).signTransaction({ ...base, type: "eip1559", ...fees })
      );
    })();
    return deps.broadcast(network, raw);
  }

  function getEthereumProvider(options?: { chainId?: number }): EIP1193Provider {
    let chainId = options?.chainId ?? 1;

    const request = async ({
      method,
      params,
    }: {
      method: string;
      params?: unknown;
    }): Promise<unknown> => {
      const args = Array.isArray(params) ? params : [];
      switch (method) {
        case "eth_accounts":
        case "eth_requestAccounts":
          return addresses.evm ? [addresses.evm] : [];
        case "eth_chainId":
          return `0x${chainId.toString(16)}`;
        case "wallet_switchEthereumChain": {
          const next = hexToBigInt((args[0] as { chainId?: unknown } | undefined)?.chainId);
          if (next === undefined) throw new ProviderError(-32602, "Invalid chain id.");
          chainId = Number(next);
          return null;
        }
        case "personal_sign": {
          const [data, account] = args;
          if (!ownsEvm(account)) throw new ProviderError(4100, "That account isn't this wallet's.");
          if (typeof data !== "string") throw new ProviderError(-32602, "Invalid message.");
          return signMessage(`evm:${chainId}`, isHex(data) ? hexToBytes(data) : data);
        }
        case "eth_signTypedData_v4": {
          const [account, typed] = args;
          if (!ownsEvm(account)) throw new ProviderError(4100, "That account isn't this wallet's.");
          const message = typeof typed === "string" ? JSON.parse(typed) : typed;
          if (!message || typeof message !== "object")
            throw new ProviderError(-32602, "Invalid typed data.");
          return withEvmKey((privateKey) =>
            privateKeyToAccount(privateKey).signTypedData(message as never)
          );
        }
        case "eth_sendTransaction": {
          const tx = (args[0] ?? {}) as Record<string, unknown>;
          if (tx.from !== undefined && !ownsEvm(tx.from))
            throw new ProviderError(4100, "That account isn't this wallet's.");
          if (typeof tx.to !== "string")
            throw new ProviderError(-32602, "A transaction needs a recipient.");
          const gasPrice = hexToBigInt(tx.gasPrice);
          return sendTransaction({
            chain: `evm:${chainId}`,
            to: tx.to,
            ...(typeof tx.data === "string" ? { data: tx.data } : {}),
            ...(hexToBigInt(tx.value) !== undefined ? { value: hexToBigInt(tx.value)! } : {}),
            ...(hexToBigInt(tx.gas) !== undefined ? { gasLimit: hexToBigInt(tx.gas)! } : {}),
            ...(gasPrice !== undefined ? { gasPrice } : {}),
          });
        }
        default:
          if (PASSTHROUGH_READS.has(method))
            return deps
              .client(chainId)
              .request({ method, ...(params !== undefined ? { params } : {}) });
          throw new ProviderError(4200, `${method} isn't supported by this wallet.`);
      }
    };
    return {
      request,
      on: () => undefined,
      removeListener: () => undefined,
    } as unknown as EIP1193Provider;
  }

  return {
    kind: "custom",
    isConnected: true,
    get isUnlocked() {
      return peekUnlocked(uid, pkg.walletId);
    },
    addresses,
    async unlock() {
      // Unlocking needs the passphrase or recovery secret, which only the person can give.
      throw new WalletLockedError();
    },
    signMessage,
    sendTransaction,
    async signSolanaTransaction(transaction) {
      return withSolanaSeed((seed) => signSolanaTransactionBytes(transaction, seed));
    },
    async signAuthorization(input) {
      const contract = (input.contractAddress ?? input.address) as Hex | undefined;
      if (!contract || !isAddress(contract))
        throw new Error("A delegation needs a contract address.");
      return withEvmKey((privateKey) =>
        privateKeyToAccount(privateKey).signAuthorization({
          contractAddress: contract,
          chainId: input.chainId,
          nonce: input.nonce,
        })
      );
    },
    getEthereumProvider,
  };
}
