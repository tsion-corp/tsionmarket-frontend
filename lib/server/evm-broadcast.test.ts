import { keccak256, parseSignature, serializeTransaction } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MAX_RAW_BYTES,
  RateLimiter,
  broadcastRpcUrl,
  inspectRawTransaction,
  senderCheck,
} from "./evm-broadcast";

const account = privateKeyToAccount(generatePrivateKey());
const TO = "0x1111111111111111111111111111111111111111" as const;

const eip1559 = (chainId = 8453) =>
  account.signTransaction({
    type: "eip1559",
    chainId,
    nonce: 1,
    to: TO,
    value: 5n,
    gas: 21_000n,
    maxFeePerGas: 2_000_000_000n,
    maxPriorityFeePerGas: 1_000_000n,
  });

describe("inspecting a raw transaction", () => {
  it("accepts a signed transaction for the right chain and names who signed it", async () => {
    const result = await inspectRawTransaction(await eip1559(), 8453);
    expect(result).toEqual({ ok: true, sender: account.address.toLowerCase(), type: "eip1559" });

    const legacy = await account.signTransaction({
      type: "legacy",
      chainId: 8453,
      nonce: 0,
      to: TO,
      gas: 21_000n,
      gasPrice: 1_000_000_000n,
    });
    expect(await inspectRawTransaction(legacy, 8453)).toMatchObject({ ok: true, type: "legacy" });

    const access = await account.signTransaction({
      type: "eip2930",
      chainId: 8453,
      nonce: 0,
      to: TO,
      gas: 21_000n,
      gasPrice: 1_000_000_000n,
    });
    expect(await inspectRawTransaction(access, 8453)).toMatchObject({ ok: true, type: "eip2930" });
  });

  it("refuses a transaction for another network, so it cannot be replayed here", async () => {
    expect(await inspectRawTransaction(await eip1559(1), 8453)).toMatchObject({
      ok: false,
      code: "WRONG_CHAIN",
    });
    expect(await inspectRawTransaction(await eip1559(8453), 1)).toMatchObject({
      ok: false,
      code: "WRONG_CHAIN",
    });
  });

  it("refuses an unprotected legacy transaction, which is valid on every chain", async () => {
    const unsigned = serializeTransaction({
      type: "legacy",
      nonce: 0,
      to: TO,
      gas: 21_000n,
      gasPrice: 1_000_000_000n,
    });
    const signature = parseSignature(await account.sign({ hash: keccak256(unsigned) }));
    const unprotected = serializeTransaction(
      { type: "legacy", nonce: 0, to: TO, gas: 21_000n, gasPrice: 1_000_000_000n },
      { ...signature, v: BigInt(27 + (signature.yParity ?? 0)) }
    );
    expect(await inspectRawTransaction(unprotected, 8453)).toMatchObject({
      ok: false,
      code: "WRONG_CHAIN",
    });
  });

  it("refuses delegation transactions, which could change what the account is", async () => {
    const authorization = await account.signAuthorization({
      contractAddress: TO,
      chainId: 8453,
      nonce: 0,
    });
    const raw = await account.signTransaction({
      type: "eip7702",
      chainId: 8453,
      nonce: 1,
      to: TO,
      gas: 100_000n,
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000n,
      authorizationList: [authorization],
    });
    expect(await inspectRawTransaction(raw, 8453)).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_TRANSACTION",
    });
  });

  it("refuses anything that is not a signed transaction, and never throws", async () => {
    const unsigned = serializeTransaction({
      type: "eip1559",
      chainId: 8453,
      nonce: 0,
      to: TO,
      gas: 21_000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
    });
    const bad: unknown[] = [
      undefined,
      null,
      42,
      {},
      "",
      "0x",
      "0xzz",
      "not hex",
      "0x03",
      "0x03deadbeef",
      "0x02",
      unsigned,
      `0x${"ff".repeat(64)}`,
      "0x" + "00".repeat(MAX_RAW_BYTES + 1),
    ];
    for (const raw of bad) {
      const result = await inspectRawTransaction(raw, 8453);
      expect(result.ok, String(raw).slice(0, 30)).toBe(false);
    }
  });
});

describe("which networks are switched on", () => {
  it("reads an operator's endpoint for a network, https only (or the local machine)", () => {
    const env = {
      EVM_BROADCAST_RPC_BASE_MAINNET: "https://rpc.example.com/base/KEY",
      EVM_BROADCAST_RPC_ETH_MAINNET: "http://rpc.example.com/eth",
      EVM_BROADCAST_RPC_ARB_MAINNET: "http://127.0.0.1:8545",
      EVM_BROADCAST_RPC_OPT_MAINNET: "   ",
      EVM_BROADCAST_RPC_POLYGON_MAINNET: "not a url",
    } as unknown as NodeJS.ProcessEnv;
    expect(broadcastRpcUrl("base-mainnet", env)).toBe("https://rpc.example.com/base/KEY");
    expect(broadcastRpcUrl("eth-mainnet", env)).toBeNull(); // plain http to a remote host
    expect(broadcastRpcUrl("arb-mainnet", env)).toBe("http://127.0.0.1:8545");
    expect(broadcastRpcUrl("opt-mainnet", env)).toBeNull();
    expect(broadcastRpcUrl("polygon-mainnet", env)).toBeNull();
    expect(broadcastRpcUrl("bnb-mainnet", env)).toBeNull(); // not switched on
  });
});

describe("checking the sender against the wallet service", () => {
  const env = {
    CRYPTO_WALLET_API_URL: "http://wallet.local/",
    WALLET_INTERNAL_KEY: "k".repeat(40),
  } as unknown as NodeJS.ProcessEnv;
  const answer = (addresses: Array<{ family: string; address: string }>) =>
    vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: { addresses } }), { status: 200 })
    );

  it("recognises the user's own EVM address, however it is cased, and sends the service key", async () => {
    const fetcher = answer([{ family: "evm", address: account.address.toLowerCase() }]);
    expect(
      await senderCheck(
        "user/1",
        account.address.toUpperCase().replace("0X", "0x"),
        env,
        fetcher as never
      )
    ).toBe("registered");
    const [url, init] = fetcher.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("http://wallet.local/internal/users/user%2F1/wallet-addresses");
    expect((init.headers as Record<string, string>)["x-service-key"]).toBe("k".repeat(40));
  });

  it("says no for an address that is not theirs, or is only a Solana one", async () => {
    expect(
      await senderCheck(
        "u",
        account.address,
        env,
        answer([{ family: "evm", address: TO }]) as never
      )
    ).toBe("not_registered");
    expect(
      await senderCheck(
        "u",
        account.address,
        env,
        answer([{ family: "solana", address: account.address }]) as never
      )
    ).toBe("not_registered");
    expect(await senderCheck("u", account.address, env, answer([]) as never)).toBe(
      "not_registered"
    );
  });

  it("fails closed when it cannot be sure", async () => {
    expect(await senderCheck("u", TO, {} as unknown as NodeJS.ProcessEnv)).toBe("unconfigured");
    expect(
      await senderCheck("u", TO, {
        CRYPTO_WALLET_API_URL: "http://x",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe("unconfigured");
    expect(
      await senderCheck(
        "u",
        TO,
        env,
        vi.fn(async () => new Response("no", { status: 500 })) as never
      )
    ).toBe("unavailable");
    expect(
      await senderCheck(
        "u",
        TO,
        env,
        vi.fn(async () => {
          throw new Error("down");
        }) as never
      )
    ).toBe("unavailable");
    expect(
      await senderCheck(
        "u",
        TO,
        env,
        vi.fn(async () => new Response("not json", { status: 200 })) as never
      )
    ).toBe("unavailable");
  });
});

describe("the rate limit", () => {
  it("counts per key per window", () => {
    let t = 0;
    const limiter = new RateLimiter(2, 100, () => t);
    expect([
      limiter.allow("a"),
      limiter.allow("a"),
      limiter.allow("a"),
      limiter.allow("b"),
    ]).toEqual([true, true, false, true]);
    t = 150;
    expect(limiter.allow("a")).toBe(true);
  });
});
