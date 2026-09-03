import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSponsoredEvmChainByNetwork } from "@/lib/trade/sponsored-evm";

const { alchemyRpcProxyFetch, hasAlchemyRpcKey } = vi.hoisted(() => ({
  alchemyRpcProxyFetch: vi.fn(),
  hasAlchemyRpcKey: vi.fn(() => false),
}));
vi.mock("@/lib/server/alchemy-keys", () => ({ alchemyRpcProxyFetch, hasAlchemyRpcKey }));

const base = getSponsoredEvmChainByNetwork("base-mainnet");
if (!base) throw new Error("Base registry entry is missing");

function rpcResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("pooled EVM RPC reads", () => {
  beforeEach(() => {
    hasAlchemyRpcKey.mockReturnValue(false);
    alchemyRpcProxyFetch.mockReset();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("uses a public Base RPC without consuming an Alchemy key", async () => {
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
    expect(String(vi.mocked(fetch).mock.calls[0][0])).not.toContain("/v2/");
    expect(alchemyRpcProxyFetch).not.toHaveBeenCalled();
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

  it("moves to another public RPC after a transient failure", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(rpcResponse({ error: "rate limited" }, 429))
      .mockResolvedValueOnce(rpcResponse({ jsonrpc: "2.0", id: 1, result: "0x456" }));
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const result = await forwardEvmRpcRead(base, {
      id: 7,
      method: "eth_getTransactionReceipt",
      params: [`0x${"12".repeat(32)}`],
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.payload).toMatchObject({ id: 7, result: "0x456" });
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

  it("uses the Alchemy key pool only after public providers fail", async () => {
    hasAlchemyRpcKey.mockReturnValue(true);
    vi.mocked(fetch).mockRejectedValue(new Error("public RPC unavailable"));
    alchemyRpcProxyFetch.mockResolvedValueOnce(
      rpcResponse({ jsonrpc: "2.0", id: 1, result: "0x789" })
    );
    const { forwardEvmRpcRead } = await import("./evm-rpc");
    const result = await forwardEvmRpcRead(base, {
      id: 9,
      method: "eth_getTransactionByHash",
      params: [`0x${"34".repeat(32)}`],
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(alchemyRpcProxyFetch).toHaveBeenCalledOnce();
    expect(result.payload).toMatchObject({ id: 9, result: "0x789" });
  });
});
