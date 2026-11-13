import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import {
  address as solanaAddress,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  hashTypedData,
  parseTransaction,
  recoverTransactionAddress,
  verifyMessage,
  verifyTypedData,
  type Hex,
} from "viem";
import { recoverAuthorizationAddress } from "viem/utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  clearUnlocked,
  createWallet,
  setUnlocked,
  type Argon2Params,
  type CreatedWallet,
} from "@/lib/wallet-core";
import { createCustomSigner, type ChainClient } from "./custom-signer";
import { WalletLockedError, type WalletSigner } from "./types";

const UID = "6f1d2c1e-9c7a-4b7e-8a2f-0d3c4e5f6a7b";
const FAST: Argon2Params = { memoryKiB: 32_768, iterations: 2, parallelism: 1, hashLength: 32 };
const RECIPIENT = "0x1111111111111111111111111111111111111111" as Hex;

let wallet: CreatedWallet;
let evm: Hex;
let sol: string;

beforeAll(async () => {
  wallet = await createWallet({
    walletId: "wallet-signer-1",
    accounts: [
      { accountId: "acc-evm", family: "evm", networkIds: ["evm"] },
      { accountId: "acc-sol", family: "solana", networkIds: ["solana-mainnet"] },
    ],
    passphrase: "correct horse battery staple",
    params: FAST,
  });
  evm = wallet.addresses.find((a) => a.family === "evm")!.address as Hex;
  sol = wallet.addresses.find((a) => a.family === "solana")!.address;
}, 60_000);

afterEach(() => clearUnlocked());

const unlock = () => setUnlocked(UID, wallet.package.walletId, wallet.dek);

function fakeClient(overrides: Partial<ChainClient> = {}): ChainClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getTransactionCount: async () => {
      calls.push("nonce");
      return 7;
    },
    estimateGas: async () => {
      calls.push("estimate");
      return 21_000n;
    },
    estimateFeesPerGas: async () => {
      calls.push("fees");
      return { maxFeePerGas: 2_000_000_000n, maxPriorityFeePerGas: 1_000_000n };
    },
    request: async ({ method }) => `read:${method}`,
    ...overrides,
  };
}

function setup(clientOverrides: Partial<ChainClient> = {}) {
  const client = fakeClient(clientOverrides);
  const broadcast = vi.fn<(network: string, raw: Hex) => Promise<Hex>>(
    async () => `0x${"ab".repeat(32)}` as Hex
  );
  const signer = createCustomSigner({
    uid: UID,
    pkg: wallet.package,
    broadcast,
    client: () => client,
    networkOf: (chainId) => ({ 1: "eth-mainnet", 8453: "base-mainnet" })[chainId] ?? null,
  });
  return { signer, client, broadcast };
}

describe("the self-custody wallet as a signer", () => {
  it("presents the wallet's own addresses, and says what it is", () => {
    const { signer } = setup();
    expect(signer.kind).toBe("custom");
    expect(signer.isConnected).toBe(true);
    expect(signer.addresses).toEqual({ evm, solana: sol });
  });

  it("signs nothing while locked, whatever is asked, and cannot unlock itself", async () => {
    const { signer, broadcast } = setup();
    expect(signer.isUnlocked).toBe(false);
    const provider = signer.getEthereumProvider({ chainId: 8453 });
    const attempts: Array<() => Promise<unknown>> = [
      () => signer.signMessage("evm:8453", "hi"),
      () => signer.signMessage("solana:mainnet", "hi"),
      () => signer.sendTransaction({ chain: "evm:8453", to: RECIPIENT, value: 1n }),
      () => signer.signSolanaTransaction(new Uint8Array(100)),
      () => signer.signAuthorization({ chainId: 8453, contractAddress: RECIPIENT, nonce: 0 }),
      () => provider.request({ method: "personal_sign", params: ["0x68690a", evm] } as never),
      () =>
        provider.request({ method: "eth_sendTransaction", params: [{ to: RECIPIENT }] } as never),
      () => signer.unlock(),
    ];
    for (const attempt of attempts)
      await expect(attempt()).rejects.toBeInstanceOf(WalletLockedError);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("follows the lock: open after unlocking, closed after locking", () => {
    const { signer } = setup();
    unlock();
    expect(signer.isUnlocked).toBe(true);
    clearUnlocked();
    expect(signer.isUnlocked).toBe(false);
  });
});

describe("signing messages", () => {
  it("signs an Ethereum message so it verifies for this wallet's address (text and raw bytes)", async () => {
    unlock();
    const { signer } = setup();
    const text = await signer.signMessage("evm:8453", "Sign in to Ark");
    expect(text).toMatch(/^0x[0-9a-f]{130}$/);
    expect(
      await verifyMessage({ address: evm, message: "Sign in to Ark", signature: text as Hex })
    ).toBe(true);

    const raw = Uint8Array.from([1, 2, 3, 250]);
    const bytes = await signer.signMessage("evm:1", raw);
    expect(await verifyMessage({ address: evm, message: { raw }, signature: bytes as Hex })).toBe(
      true
    );
    // It is this wallet's signature and nobody else's.
    expect(
      await verifyMessage({ address: RECIPIENT, message: "Sign in to Ark", signature: text as Hex })
    ).toBe(false);
  });

  it("signs a Solana message, returned base58, that verifies for this wallet's address", async () => {
    unlock();
    const { signer } = setup();
    const signature = await signer.signMessage("solana:mainnet", "Link my wallet");
    expect(
      ed25519.verify(
        base58.decode(signature),
        new TextEncoder().encode("Link my wallet"),
        base58.decode(sol)
      )
    ).toBe(true);
  });

  it("refuses chains it does not hold a key for", async () => {
    unlock();
    const { signer } = setup();
    await expect(signer.signMessage("tron:mainnet", "x")).rejects.toThrow(/isn't supported/);
    await expect(signer.signMessage("bitcoin", "x")).rejects.toThrow(/isn't supported/);
  });
});

describe("delegating the account (EIP-7702)", () => {
  it("signs a delegation that recovers to this wallet, under either parameter name", async () => {
    unlock();
    const { signer } = setup();
    for (const parameter of [{ contractAddress: RECIPIENT }, { address: RECIPIENT }]) {
      const signed = await signer.signAuthorization({ chainId: 8453, nonce: 4, ...parameter });
      expect(await recoverAuthorizationAddress({ authorization: signed })).toBe(evm);
      expect(signed).toMatchObject({ chainId: 8453, nonce: 4 });
    }
  });

  it("refuses a delegation with no valid contract", async () => {
    unlock();
    const { signer } = setup();
    await expect(signer.signAuthorization({ chainId: 8453, nonce: 0 })).rejects.toThrow(
      /contract address/
    );
    await expect(
      signer.signAuthorization({ chainId: 8453, nonce: 0, address: "0x12" })
    ).rejects.toThrow();
  });
});

describe("a plain user-paid transaction", () => {
  it("builds, signs and broadcasts an EIP-1559 transaction that recovers to this wallet", async () => {
    unlock();
    const { signer, client, broadcast } = setup();
    const hash = await signer.sendTransaction({
      chain: "evm:8453",
      to: RECIPIENT,
      value: 12_345n,
      data: "0xdeadbeef",
    });
    expect(hash).toBe(`0x${"ab".repeat(32)}`);
    expect(client.calls).toEqual(["nonce", "estimate", "fees"]);

    const [network, raw] = broadcast.mock.calls[0]!;
    expect(network).toBe("base-mainnet");
    const tx = parseTransaction(raw);
    expect(tx).toMatchObject({
      type: "eip1559",
      chainId: 8453,
      nonce: 7,
      to: RECIPIENT,
      value: 12_345n,
      data: "0xdeadbeef",
      gas: 25_200n, // the estimate, plus 20%
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
    });
    expect(await recoverTransactionAddress({ serializedTransaction: raw as never })).toBe(evm);
  });

  it("sends a legacy transaction at the given gas price, without asking the chain to estimate", async () => {
    unlock();
    const { signer, client, broadcast } = setup();
    await signer.sendTransaction({
      chain: "evm:1",
      to: RECIPIENT,
      gasLimit: 50_000n,
      gasPrice: 3_000_000_000n,
    });
    expect(client.calls).toEqual(["nonce"]);
    const [network, raw] = broadcast.mock.calls[0]!;
    expect(network).toBe("eth-mainnet");
    expect(parseTransaction(raw)).toMatchObject({
      type: "legacy",
      chainId: 1,
      gas: 50_000n,
      gasPrice: 3_000_000_000n,
    });
    expect(await recoverTransactionAddress({ serializedTransaction: raw as never })).toBe(evm);
  });

  it("refuses a network it does not send on, a bad recipient, bad data and an absurd gas limit", async () => {
    unlock();
    const { signer, broadcast } = setup();
    await expect(signer.sendTransaction({ chain: "evm:999", to: RECIPIENT })).rejects.toThrow(
      /can't send on that network/
    );
    await expect(
      signer.sendTransaction({ chain: "solana:mainnet", to: RECIPIENT })
    ).rejects.toThrow(/isn't supported/);
    await expect(signer.sendTransaction({ chain: "evm:8453", to: "0x12" })).rejects.toThrow(
      /valid address/
    );
    await expect(
      signer.sendTransaction({ chain: "evm:8453", to: RECIPIENT, data: "nothex" })
    ).rejects.toThrow(/data isn't valid/);
    await expect(
      signer.sendTransaction({ chain: "evm:8453", to: RECIPIENT, gasLimit: 20_000_000n })
    ).rejects.toThrow(/more gas/);
    await expect(
      signer.sendTransaction({ chain: "evm:8453", to: RECIPIENT, gasLimit: 0n })
    ).rejects.toThrow(/more gas/);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("does not broadcast when the chain cannot estimate, and passes the failure on", async () => {
    unlock();
    const { signer, broadcast } = setup({
      estimateGas: async () => {
        throw new Error("execution reverted");
      },
    });
    await expect(signer.sendTransaction({ chain: "evm:8453", to: RECIPIENT })).rejects.toThrow(
      /reverted/
    );
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe("as an Ethereum provider (what dapps and the app's sponsored flows call)", () => {
  const request = (signer: WalletSigner, chainId: number, method: string, params?: unknown[]) =>
    signer.getEthereumProvider({ chainId }).request({ method, params } as never);

  it("reports its account and chain, and can switch chain", async () => {
    unlock();
    const { signer } = setup();
    const provider = signer.getEthereumProvider({ chainId: 8453 });
    expect(await provider.request({ method: "eth_accounts" } as never)).toEqual([evm]);
    expect(await provider.request({ method: "eth_requestAccounts" } as never)).toEqual([evm]);
    expect(await provider.request({ method: "eth_chainId" } as never)).toBe("0x2105");
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1" }],
    } as never);
    expect(await provider.request({ method: "eth_chainId" } as never)).toBe("0x1");
    await expect(
      provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "nope" }],
      } as never)
    ).rejects.toMatchObject({ code: -32602 });
    expect(typeof provider.on).toBe("function");
    expect(typeof provider.removeListener).toBe("function");
  });

  it("personal_sign verifies for this wallet, and refuses another account", async () => {
    unlock();
    const { signer } = setup();
    const messageHex = "0x48656c6c6f"; // "Hello"
    const signature = (await request(signer, 8453, "personal_sign", [messageHex, evm])) as Hex;
    expect(await verifyMessage({ address: evm, message: { raw: messageHex }, signature })).toBe(
      true
    );
    await expect(
      request(signer, 8453, "personal_sign", [messageHex, RECIPIENT])
    ).rejects.toMatchObject({ code: 4100 });
    await expect(request(signer, 8453, "personal_sign", [5, evm])).rejects.toMatchObject({
      code: -32602,
    });
  });

  it("eth_signTypedData_v4 verifies for this wallet (domain row included, as dapps send it)", async () => {
    unlock();
    const { signer } = setup();
    const typed = {
      domain: { name: "Ark", version: "1", chainId: 8453, verifyingContract: RECIPIENT },
      types: {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        Order: [
          { name: "maker", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
      primaryType: "Order",
      message: { maker: evm, amount: "1000000" },
    };
    for (const payload of [JSON.stringify(typed), typed]) {
      const signature = (await request(signer, 8453, "eth_signTypedData_v4", [
        evm,
        payload,
      ])) as Hex;
      expect(
        await verifyTypedData({
          address: evm,
          domain: typed.domain,
          types: { Order: typed.types.Order },
          primaryType: "Order",
          message: { maker: evm, amount: 1_000_000n },
          signature,
        })
      ).toBe(true);
    }
    expect(
      hashTypedData({
        domain: typed.domain,
        types: { Order: typed.types.Order },
        primaryType: "Order",
        message: { maker: evm, amount: 1_000_000n },
      })
    ).toMatch(/^0x/);
    await expect(
      request(signer, 8453, "eth_signTypedData_v4", [RECIPIENT, "{}"])
    ).rejects.toMatchObject({ code: 4100 });
  });

  it("eth_sendTransaction goes the same way as a direct send, on the chain the provider is on", async () => {
    unlock();
    const { signer, broadcast } = setup();
    const hash = await request(signer, 8453, "eth_sendTransaction", [
      { from: evm, to: RECIPIENT, value: "0x10", data: "0x01", gas: "0x7530" },
    ]);
    expect(hash).toBe(`0x${"ab".repeat(32)}`);
    const [network, raw] = broadcast.mock.calls[0]!;
    expect(network).toBe("base-mainnet");
    expect(parseTransaction(raw)).toMatchObject({
      chainId: 8453,
      to: RECIPIENT,
      value: 16n,
      gas: 30_000n,
    });
    await expect(
      request(signer, 8453, "eth_sendTransaction", [{ from: RECIPIENT, to: RECIPIENT }])
    ).rejects.toMatchObject({ code: 4100 });
    await expect(
      request(signer, 8453, "eth_sendTransaction", [{ from: evm }])
    ).rejects.toMatchObject({ code: -32602 });
  });

  it("passes reads to the chain, and nothing else that could sign, send or reveal", async () => {
    unlock();
    const { signer, broadcast } = setup();
    expect(await request(signer, 8453, "eth_call", [{ to: RECIPIENT }, "latest"])).toBe(
      "read:eth_call"
    );
    expect(await request(signer, 8453, "eth_getBalance", [evm, "latest"])).toBe(
      "read:eth_getBalance"
    );
    for (const method of [
      "eth_sendRawTransaction",
      "eth_sign",
      "eth_signTransaction",
      "personal_ecRecover",
      "wallet_addEthereumChain",
      "eth_getEncryptionPublicKey",
      "anything_else",
    ]) {
      await expect(request(signer, 8453, method, [])).rejects.toMatchObject({ code: 4200 });
    }
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe("signing a Solana transaction", () => {
  const BLOCKHASH = base58.encode(new Uint8Array(32).fill(3)) as Blockhash;
  const build = (from: string) => {
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(createNoopSigner(solanaAddress(from)), m),
      (m) =>
        setTransactionMessageLifetimeUsingBlockhash(
          { blockhash: BLOCKHASH, lastValidBlockHeight: 10n },
          m
        ),
      (m) =>
        appendTransactionMessageInstructions(
          [
            getTransferSolInstruction({
              source: createNoopSigner(solanaAddress(from)),
              destination: solanaAddress(
                base58.encode(ed25519.getPublicKey(ed25519.utils.randomPrivateKey()))
              ),
              amount: 5n,
            }),
          ],
          m
        )
    );
    const compiled = compileTransaction(message);
    return { compiled, bytes: new Uint8Array(getTransactionEncoder().encode(compiled)) };
  };

  it("signs a transfer from this wallet, verifiable against its address", async () => {
    unlock();
    const { signer } = setup();
    const { compiled, bytes } = build(sol);
    const signed = await signer.signSolanaTransaction(bytes);
    const decoded = getTransactionDecoder().decode(signed);
    expect(
      ed25519.verify(
        decoded.signatures[solanaAddress(sol)]!,
        new Uint8Array(compiled.messageBytes),
        base58.decode(sol)
      )
    ).toBe(true);
  });

  it("refuses a transaction that is someone else's", async () => {
    unlock();
    const { signer } = setup();
    const other = base58.encode(ed25519.getPublicKey(ed25519.utils.randomPrivateKey()));
    await expect(signer.signSolanaTransaction(build(other).bytes)).rejects.toThrow(
      /isn't for this wallet/
    );
  });
});
