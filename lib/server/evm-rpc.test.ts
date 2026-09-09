import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSponsoredEvmChainByNetwork } from "@/lib/trade/sponsored-evm";

const base = getSponsoredEvmChainByNetwork("base-mainnet");
if (!base) throw new Error("Base registry entry is missing");

function rpcResponse(payload: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

// Answers a JSON-RPC batch the way a node does: one envelope per call, ids
// echoed. The read pool always sends batches.
function batchAnswer(result: unknown) {
  return async (_url: unknown, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body));
    const calls = Array.isArray(request) ? request : [request];
    return rpcResponse(calls.map((call) => ({ jsonrpc: "2.0", id: call.id, result })));
  };
}

const ZERODEV_URL = "https://rpc.zerodev.app/api/v3/test-project-id-123/chain/8453";
const ALCHEMY_URL = "https://base-mainnet.g.alchemy.com/v2/alchemy-key";
const calledUrls = () => vi.mocked(fetch).mock.calls.map((call) => String(call[0]));

describe("ZeroDev EVM RPC reads", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ZERODEV_PROJECT_ID", "test-project-id-123");
    vi.stubEnv("ALCHEMY_API_KEY", "alchemy-key");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("uses the ZeroDev endpoint for Base reads", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(rpcResponse({ jsonrpc: "2.0", id: 1, result: "0x123" }));
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const result = await forwardEvmRpcRead(base, {
      jsonrpc: "2.0",
      id: 44,
      method: "eth_getBalance",
      params: ["0x0000000000000000000000000000000000000001", "latest"],
    });

    expect(result).toMatchObject({
      status: 200,
      payload: { jsonrpc: "2.0", id: 44, result: "0x123" },
    });
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
      "https://rpc.zerodev.app/api/v3/test-project-id-123/chain/8453"
    );
  });

  it("deduplicates concurrent reads even when caller JSON-RPC ids differ", async () => {
    const answer = batchAnswer("0xabc");
    vi.mocked(fetch).mockImplementationOnce(async (url, init) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return answer(url, init);
    });
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const params = ["0x0000000000000000000000000000000000000002", "latest"];
    const [first, second] = await Promise.all([
      forwardEvmRpcRead(base, { id: 91, method: "eth_getCode", params }),
      forwardEvmRpcRead(base, { id: "caller-two", method: "eth_getCode", params }),
    ]);

    expect(fetch).toHaveBeenCalledOnce();
    expect(first.payload).toMatchObject({ id: 91, result: "0xabc" });
    expect(second.payload).toMatchObject({ id: "caller-two", result: "0xabc" });
  });

  it("caches equivalent state reads across caller JSON-RPC ids", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(rpcResponse({ jsonrpc: "2.0", id: 1, result: "0x5" }));
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const params = ["0x0000000000000000000000000000000000000004", "latest"];

    const first = await forwardEvmRpcRead(base, { id: 1, method: "eth_getBalance", params });
    const second = await forwardEvmRpcRead(base, { id: 2, method: "eth_getBalance", params });

    expect(fetch).toHaveBeenCalledOnce();
    expect(first.payload).toMatchObject({ id: 1, result: "0x5" });
    expect(second.payload).toMatchObject({ id: 2, result: "0x5" });
  });

  // The proxy reads through the same pool as the server sweep: a ZeroDev rate
  // limit or an unserved chain moves the read to the Alchemy key pool instead
  // of failing every balance on screen (ADR-2026-09-09-portfolio-refresh-scope).
  it("falls back to Alchemy when ZeroDev is rate limited", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(rpcResponse({ error: "rate limited" }, 429))
      .mockImplementationOnce(batchAnswer("0x5"));
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const result = await forwardEvmRpcRead(base, {
      id: 7,
      method: "eth_getTransactionReceipt",
      params: [`0x${"12".repeat(32)}`],
    });

    expect(calledUrls()).toEqual([ZERODEV_URL, ALCHEMY_URL]);
    expect(result).toMatchObject({ status: 200, payload: { id: 7, result: "0x5" } });
  });

  it("keeps ZeroDev out for a while after a rate limit and reads from Alchemy meanwhile", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(rpcResponse({ error: "rate limited" }, 429))
      .mockImplementation(batchAnswer("0x6"));
    const { forwardEvmRpcRead } = await import("./evm-rpc");

    await forwardEvmRpcRead(base, {
      id: 1,
      method: "eth_getBalance",
      params: ["0x0000000000000000000000000000000000000005", "latest"],
    });
    const next = await forwardEvmRpcRead(base, { id: 2, method: "eth_blockNumber" });

    expect(calledUrls()).toEqual([ZERODEV_URL, ALCHEMY_URL, ALCHEMY_URL]);
    expect(next).toMatchObject({ status: 200, payload: { id: 2, result: "0x6" } });
  });

  it("falls back to Alchemy for a chain ZeroDev does not serve", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response("No API provider supports the requested chainId", { status: 400 })
      )
      .mockImplementationOnce(batchAnswer("0x7"));
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const result = await forwardEvmRpcRead(base, { id: 3, method: "eth_blockNumber" });

    expect(calledUrls()).toEqual([ZERODEV_URL, ALCHEMY_URL]);
    expect(result).toMatchObject({ status: 200, payload: { id: 3, result: "0x7" } });
  });

  it("serves a recent cached value when every provider is down", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T00:00:00Z"));
    vi.mocked(fetch)
      .mockImplementationOnce(batchAnswer("0x9"))
      .mockResolvedValueOnce(rpcResponse({ error: "rate limited" }, 429))
      .mockRejectedValue(new Error("network down"));
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const params = ["0x0000000000000000000000000000000000000006", "latest"];

    await forwardEvmRpcRead(base, { id: 1, method: "eth_getBalance", params });
    vi.advanceTimersByTime(2_001);
    const stale = await forwardEvmRpcRead(base, { id: 3, method: "eth_getBalance", params });

    expect(stale).toMatchObject({ status: 200, payload: { id: 3, result: "0x9" } });
  });

  it("does not retry deterministic contract reverts", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      rpcResponse({ jsonrpc: "2.0", id: 1, error: { code: 3, message: "execution reverted" } })
    );
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const result = await forwardEvmRpcRead(base, {
      id: 8,
      method: "eth_call",
      params: [{ to: "0x0000000000000000000000000000000000000003" }, "latest"],
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(result.payload).toMatchObject({ id: 8, error: { message: "execution reverted" } });
  });

  it("reads through Alchemy when ZeroDev is not configured", async () => {
    vi.stubEnv("ZERODEV_PROJECT_ID", "");
    vi.mocked(fetch).mockImplementationOnce(batchAnswer("0x8"));
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const result = await forwardEvmRpcRead(base, {
      id: 9,
      method: "eth_getTransactionByHash",
      params: [`0x${"34".repeat(32)}`],
    });

    expect(calledUrls()).toEqual([ALCHEMY_URL]);
    expect(result).toMatchObject({ status: 200, payload: { id: 9, result: "0x8" } });
  });

  it("fails closed when no read provider is configured at all", async () => {
    vi.stubEnv("ZERODEV_PROJECT_ID", "");
    vi.stubEnv("ALCHEMY_API_KEY", "");
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    await expect(forwardEvmRpcRead(base, { id: 10, method: "eth_blockNumber" })).rejects.toThrow(
      /No read provider/
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
