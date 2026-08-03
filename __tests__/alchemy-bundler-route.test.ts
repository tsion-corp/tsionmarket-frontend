import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { verifyRequest } = vi.hoisted(() => ({ verifyRequest: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

async function loadRoute() {
  vi.resetModules();
  process.env.ALCHEMY_API_KEY = "test-key";
  process.env.ALCHEMY_GAS_POLICY_ID = "test-policy";
  return import("@/app/api/alchemy-bundler/[network]/route");
}

describe("alchemy-bundler proxy route", () => {
  beforeEach(() => {
    verifyRequest.mockReset();
    global.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({ result: "0x1" }),
    })) as unknown as typeof fetch;
  });

  it("rejects unsupported sponsored-network slugs with 404", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ method: "eth_chainId", params: [] }), {
      params: Promise.resolve({ network: "zksync-mainnet" }),
    });
    expect(res.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards allowed methods to the selected network host with the policy header", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ method: "eth_sendUserOperation", params: [] }), {
      params: Promise.resolve({ network: "arb-mainnet" }),
    });
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0];
    expect(url).toContain("arb-mainnet.g.alchemy.com/v2/test-key");
    expect((init.headers as Record<string, string>)["x-alchemy-policy-id"]).toBe("test-policy");
  });

  it("forwards newer registry-backed networks, not just the original footprint", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ method: "eth_sendUserOperation", params: [] }), {
      params: Promise.resolve({ network: "robinhood-mainnet" }),
    });
    expect(res.status).toBe(200);
    const [url] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(url).toContain("robinhood-mainnet.g.alchemy.com/v2/test-key");
  });
});
