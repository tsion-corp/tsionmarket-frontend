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

describe("ZeroDev EVM RPC reads", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ZERODEV_PROJECT_ID", "test-project-id-123");
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
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const request = JSON.parse(String(init?.body));
      return rpcResponse({ jsonrpc: "2.0", id: request.id, result: "0xabc" });
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

  it("returns the ZeroDev rate-limit response without calling another provider", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(rpcResponse({ error: "rate limited" }, 429));
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const result = await forwardEvmRpcRead(base, {
      id: 7,
      method: "eth_getTransactionReceipt",
      params: [`0x${"12".repeat(32)}`],
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ status: 429, payload: { error: "rate limited" } });
  });

  it("stops new upstream calls while ZeroDev asks clients to back off", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      rpcResponse({ error: "rate limited" }, 429, { "Retry-After": "10" })
    );
    const { forwardEvmRpcRead } = await import("./evm-rpc");

    await forwardEvmRpcRead(base, {
      id: 1,
      method: "eth_getBalance",
      params: ["0x0000000000000000000000000000000000000005", "latest"],
    });
    const blocked = await forwardEvmRpcRead(base, { id: 2, method: "eth_blockNumber" });

    expect(fetch).toHaveBeenCalledOnce();
    expect(blocked).toMatchObject({
      status: 429,
      payload: { id: 2, error: { code: -32005 } },
      retryAfter: "10",
    });
  });

  it("serves a recent cached value when ZeroDev is temporarily throttled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T00:00:00Z"));
    vi.mocked(fetch)
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: "2.0", id: 1, result: "0x9" }))
      .mockResolvedValueOnce(rpcResponse({ error: "rate limited" }, 429));
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const params = ["0x0000000000000000000000000000000000000006", "latest"];

    await forwardEvmRpcRead(base, { id: 1, method: "eth_getBalance", params });
    vi.advanceTimersByTime(2_001);
    const stale = await forwardEvmRpcRead(base, { id: 3, method: "eth_getBalance", params });

    expect(fetch).toHaveBeenCalledTimes(2);
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

  it("fails closed when the ZeroDev project is not configured", async () => {
    vi.stubEnv("ZERODEV_PROJECT_ID", "");
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    await expect(
      forwardEvmRpcRead(base, {
        id: 9,
        method: "eth_getTransactionByHash",
        params: [`0x${"34".repeat(32)}`],
      })
    ).rejects.toThrow("ZeroDev RPC is not configured");
    expect(fetch).not.toHaveBeenCalled();
  });
});
