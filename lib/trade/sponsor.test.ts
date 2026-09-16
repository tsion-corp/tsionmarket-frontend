import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EIP1193Provider } from "viem";

// Wiring test for the sponsored send: a fake fetch answers every JSON-RPC call
// the flow makes and records the method behind each one, so the test can pin
// the exact set of round trips one send costs. Production traced fifteen or
// more "base-mainnet" rows per buy; the BSO send is expected to cost one gas
// estimate, one bundler send and the receipt lookups, with the
// wallet's delegation read once and remembered.

const WALLET = "0x1111111111111111111111111111111111111111" as const;
const IMPL = "0xe6cae83bde06e4c305530e199d7217f42808555b";
const DELEGATED_CODE = `0xef0100${IMPL.slice(2)}`;
const OP_HASH = `0x${"ab".repeat(32)}` as const;
const TX_HASH = `0x${"cd".repeat(32)}` as const;
const SIGNATURE = `0x${"11".repeat(64)}1b` as const;
const ESTIMATED_GAS = {
  callGasLimit: "0x5208",
  verificationGasLimit: "0x7530",
  preVerificationGas: "0xc350",
};

const RECEIPT = {
  userOpHash: OP_HASH,
  entryPoint: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",
  sender: WALLET,
  nonce: "0x5",
  actualGasUsed: "0x5208",
  actualGasCost: "0x5208",
  success: true,
  logs: [],
  receipt: {
    transactionHash: TX_HASH,
    transactionIndex: "0x1",
    blockHash: `0x${"ef".repeat(32)}`,
    blockNumber: "0x10",
    from: WALLET,
    to: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",
    cumulativeGasUsed: "0x5208",
    gasUsed: "0x5208",
    effectiveGasPrice: "0x1",
    logs: [],
    logsBloom: `0x${"00".repeat(256)}`,
    status: "0x1",
    type: "0x2",
  },
};

interface RpcCall {
  id: number;
  method: string;
  params?: unknown[];
}

interface Recorded {
  url: string;
  method: string;
  params: unknown[];
}

// viem builds a Request from the transport URL before calling fetch. The app
// uses same-origin paths, which Node's Request refuses, so the test resolves
// them against a fake origin and leaves the path itself intact for fetch.
class SameOriginRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(
      typeof input === "string" && input.startsWith("/") ? `http://app.test${input}` : input,
      init
    );
  }
}

function installFakeRpc(options: { code: string; receiptOnLook?: number }) {
  const calls: Recorded[] = [];
  vi.stubGlobal("Request", SameOriginRequest);
  let looks = 0;
  const answer = (url: string, call: RpcCall): unknown => {
    calls.push({ url, method: call.method, params: call.params ?? [] });
    switch (call.method) {
      case "eth_getCode":
        return options.code;
      case "eth_getTransactionCount":
        return "0x3";
      case "eth_call":
        return `0x${"0".repeat(63)}5`;
      case "eth_chainId":
        return "0x2105";
      case "eth_blockNumber":
        return "0x10";
      case "eth_getLogs":
        return [];
      case "eth_estimateUserOperationGas":
        return ESTIMATED_GAS;
      case "eth_sendUserOperation":
        return OP_HASH;
      case "eth_getUserOperationReceipt":
        looks += 1;
        return looks >= (options.receiptOnLook ?? 1) ? RECEIPT : null;
      default:
        throw new Error(`unexpected rpc method ${call.method}`);
    }
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body)) as RpcCall | RpcCall[];
      const reply = (call: RpcCall) => ({ jsonrpc: "2.0", id: call.id, result: answer(url, call) });
      const payload = Array.isArray(body) ? body.map(reply) : reply(body);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    })
  );
  return calls;
}

function fakeProvider(): EIP1193Provider {
  return {
    request: vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [WALLET];
      if (method === "eth_signTypedData_v4") return SIGNATURE;
      if (method === "eth_chainId") return "0x2105";
      throw new Error(`unexpected provider method ${method}`);
    }),
  } as unknown as EIP1193Provider;
}

const signAuthorization = vi.fn(async () => ({
  address: IMPL as `0x${string}`,
  chainId: 8453,
  nonce: 3,
  r: `0x${"aa".repeat(32)}` as `0x${string}`,
  s: `0x${"bb".repeat(32)}` as `0x${string}`,
  yParity: 1,
}));

// The send waits a block before its first receipt look; fake timers run that
// wait (and viem's batch scheduler) without the suite sleeping through it.
async function send(calls = [{ to: WALLET, data: "0x" as const, value: 0n }]) {
  const { sendSponsoredEvmCalls } = await import("./sponsor");
  const pending = sendSponsoredEvmCalls({
    chainId: 8453,
    address: WALLET,
    provider: fakeProvider(),
    signAuthorization,
    accessToken: "token",
    calls,
  });
  await vi.runAllTimersAsync();
  return pending;
}

const methodsAt = (calls: Recorded[], path: string) =>
  calls.filter((c) => c.url.includes(path)).map((c) => c.method);

describe("sendSponsoredEvmCalls round trips", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    signAuthorization.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("costs one gas estimate, one send and the receipt on a delegated wallet", async () => {
    const calls = installFakeRpc({ code: DELEGATED_CODE });

    await expect(send()).resolves.toBe(TX_HASH);

    expect(methodsAt(calls, "/api/evm-rpc/base-mainnet")).toEqual(["eth_getCode", "eth_call"]);
    expect(methodsAt(calls, "/api/alchemy-bundler/base-mainnet")).toEqual([
      "eth_estimateUserOperationGas",
      "eth_sendUserOperation",
      "eth_getUserOperationReceipt",
    ]);
  });

  it("fills the BSO user operation from Alchemy's gas estimate", async () => {
    const calls = installFakeRpc({ code: DELEGATED_CODE });

    await send();

    const sent = calls.find((c) => c.method === "eth_sendUserOperation");
    const op = sent?.params[0] as Record<string, unknown>;
    expect(op.sender).toBe(WALLET);
    expect(op.nonce).toBe("0x5");
    expect(op.paymaster).toBeUndefined();
    expect(op.paymasterData).toBeUndefined();
    expect(op.callGasLimit).toBe("0x5208");
    expect(op.verificationGasLimit).toBe("0x7530");
    expect(op.preVerificationGas).toBe("0x0");
    expect(op.maxFeePerGas).toBe("0x0");
    expect(op.maxPriorityFeePerGas).toBe("0x0");
    expect(op.signature).toBe(SIGNATURE);
    expect(op.eip7702Auth).toBeUndefined();
    expect(sent?.params[1]).toBe("0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108");
  });

  it("asks Alchemy to estimate the sender, nonce, calldata and stub signature", async () => {
    const calls = installFakeRpc({ code: DELEGATED_CODE });

    await send();

    const asked = calls.find((c) => c.method === "eth_estimateUserOperationGas");
    const op = asked?.params[0] as Record<string, unknown>;
    expect(op.sender).toBe(WALLET);
    expect(op.nonce).toBe("0x5");
    expect(typeof op.callData).toBe("string");
    expect(typeof op.signature).toBe("string");
    expect(op.eip7702Auth).toBeUndefined();
  });

  it("keeps looking for the receipt until the bundler has it", async () => {
    const calls = installFakeRpc({ code: DELEGATED_CODE, receiptOnLook: 3 });

    await expect(send()).resolves.toBe(TX_HASH);

    expect(methodsAt(calls, "/api/alchemy-bundler/base-mainnet")).toEqual([
      "eth_estimateUserOperationGas",
      "eth_sendUserOperation",
      "eth_getUserOperationReceipt",
      "eth_getUserOperationReceipt",
      "eth_getUserOperationReceipt",
    ]);
    // No node read is spent on waiting: the recovery scan only runs after a
    // receipt never turns up.
    expect(methodsAt(calls, "/api/evm-rpc/base-mainnet")).toEqual(["eth_getCode", "eth_call"]);
  });

  it("remembers a delegated wallet so the second send skips the code read", async () => {
    const calls = installFakeRpc({ code: DELEGATED_CODE });

    await send();
    await send();

    expect(methodsAt(calls, "/api/evm-rpc/base-mainnet")).toEqual([
      "eth_getCode",
      "eth_call",
      "eth_call",
    ]);
    expect(signAuthorization).not.toHaveBeenCalled();
  });

  it("signs an authorization for a wallet that is not delegated yet and sends it along", async () => {
    const calls = installFakeRpc({ code: "0x" });

    await expect(send()).resolves.toBe(TX_HASH);

    expect(signAuthorization).toHaveBeenCalledWith({
      contractAddress: "0xe6Cae83BdE06E4c305530e199D7217f42808555B",
      chainId: 8453,
      nonce: 3,
    });
    expect(methodsAt(calls, "/api/evm-rpc/base-mainnet")).toEqual([
      "eth_getCode",
      "eth_call",
      "eth_getTransactionCount",
    ]);
    const asked = calls.find((c) => c.method === "eth_estimateUserOperationGas");
    const op = asked?.params[0] as Record<string, unknown>;
    expect(op.eip7702Auth).toEqual({
      address: IMPL,
      chainId: "0x2105",
      nonce: "0x3",
      r: `0x${"aa".repeat(32)}`,
      s: `0x${"bb".repeat(32)}`,
      yParity: "0x01",
    });
    const sent = calls.find((c) => c.method === "eth_sendUserOperation");
    expect((sent?.params[0] as Record<string, unknown>).eip7702Auth).toBeDefined();
  });

  it("remembers the delegation once the authorizing send has landed", async () => {
    const calls = installFakeRpc({ code: "0x" });

    await send();
    await send();

    expect(methodsAt(calls, "/api/evm-rpc/base-mainnet")).toEqual([
      "eth_getCode",
      "eth_call",
      "eth_getTransactionCount",
      "eth_call",
    ]);
    expect(signAuthorization).toHaveBeenCalledTimes(1);
  });
});
