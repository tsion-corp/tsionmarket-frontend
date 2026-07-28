import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Auth is mocked so the route's own allowlist/forwarding logic is what's tested.
const { verifyRequest } = vi.hoisted(() => ({ verifyRequest: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

// The route reads ALCHEMY_* env at module load, so set env then import fresh.
async function loadRoute() {
  vi.resetModules();
  process.env.ALCHEMY_API_KEY = "test-key";
  process.env.ALCHEMY_GAS_POLICY_ID = "test-policy";
  return import("@/app/api/base-bundler/route");
}

describe("base-bundler proxy route", () => {
  beforeEach(() => {
    verifyRequest.mockReset();
    global.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({ result: "0x1" }),
    })) as unknown as typeof fetch;
  });

  it("rejects unauthenticated requests with 401 and never calls Alchemy", async () => {
    verifyRequest.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ method: "eth_chainId", params: [] }));
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects disallowed JSON-RPC methods with 403", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { POST } = await loadRoute();
    // eth_sendTransaction is not on the allowlist — the proxy must not become a
    // general-purpose paid RPC.
    const res = await POST(makeReq({ method: "eth_sendTransaction", params: [] }));
    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards allowed methods to the Base endpoint with the gas-policy header", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ method: "eth_sendUserOperation", params: [] }));
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0];
    expect(url).toContain("base-mainnet.g.alchemy.com/v2/test-key");
    expect((init.headers as Record<string, string>)["x-alchemy-policy-id"]).toBe("test-policy");
  });

  it("rejects a batch that contains any disallowed method", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { POST } = await loadRoute();
    const res = await POST(
      makeReq([{ method: "eth_chainId" }, { method: "eth_sendRawTransaction" }])
    );
    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
