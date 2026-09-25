import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ verifyRequest: vi.fn(), getRequestIdentity: vi.fn() }));
vi.mock("@/lib/server/auth", () => auth);

const { POST } = await import("@/app/api/solana-rpc/route");

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  auth.verifyRequest.mockResolvedValue({ sub: "user" });
  process.env.ALCHEMY_API_KEY = "test-key";
  delete process.env.HELIUS_API_KEY;
  delete process.env.HELIUS_API_KEY_FALLBACK;
  delete process.env.SOLANA_RPC_URL;
  // A fresh Response per call: a body can only be read once.
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "ok" }), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);
});

describe("solana rpc proxy", () => {
  it("rejects an unauthenticated caller before reaching Alchemy", async () => {
    auth.verifyRequest.mockResolvedValue(null);
    const res = await POST(makeReq({ method: "getLatestBlockhash" }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the methods the wallet flows need", async () => {
    for (const method of [
      "getLatestBlockhash",
      "getSignatureStatuses",
      "sendTransaction",
      "simulateTransaction",
      "getAccountInfo",
      "getBalance",
      "getFeeForMessage",
      "getTokenAccountsByOwner",
    ]) {
      const res = await POST(makeReq({ jsonrpc: "2.0", id: 1, method }));
      expect(res.status, method).toBe(200);
    }
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it("refuses anything outside the allowlist, so it is not a free relay", async () => {
    const res = await POST(makeReq({ jsonrpc: "2.0", id: 1, method: "getProgramAccounts" }));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks every call in a batch, not just the first", async () => {
    const res = await POST(
      makeReq([
        { jsonrpc: "2.0", id: 1, method: "getLatestBlockhash" },
        { jsonrpc: "2.0", id: 2, method: "getProgramAccounts" },
      ])
    );
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never leaks the key into the response path", async () => {
    const res = await POST(makeReq({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash" }));
    expect(await res.text()).not.toContain("test-key");
    expect(String(fetchMock.mock.calls[0][0])).toContain("test-key");
  });

  it("fails over to public mainnet when Alchemy is unavailable", async () => {
    fetchMock
      .mockImplementationOnce(async () => new Response("upstream down", { status: 502 }))
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "fallback-ok" }), {
            status: 200,
          })
      );

    const res = await POST(makeReq({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash" }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ result: "fallback-ok" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("test-key");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.mainnet-beta.solana.com");
  });

  it("uses a configured Solana RPC before the shared providers", async () => {
    process.env.SOLANA_RPC_URL = "https://rpc.example.test";

    const res = await POST(makeReq({ jsonrpc: "2.0", id: 1, method: "getBalance" }));

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe("https://rpc.example.test");
  });

  it("uses both Helius keys before falling back to Alchemy", async () => {
    process.env.HELIUS_API_KEY = "helius-primary";
    process.env.HELIUS_API_KEY_FALLBACK = "helius-fallback";
    fetchMock
      .mockImplementationOnce(async () => new Response("rate limited", { status: 429 }))
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "helius-ok" }), {
            status: 200,
          })
      );

    const res = await POST(makeReq({ jsonrpc: "2.0", id: 1, method: "getBalance" }));

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://mainnet.helius-rpc.com/?api-key=helius-primary",
      "https://mainnet.helius-rpc.com/?api-key=helius-fallback",
    ]);
  });
});
