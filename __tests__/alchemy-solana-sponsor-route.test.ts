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
  process.env.ALCHEMY_SOLANA_POLICY_ID = "solana-policy";
  return import("@/app/api/alchemy-solana-sponsor/route");
}

describe("alchemy-solana-sponsor route", () => {
  beforeEach(() => {
    verifyRequest.mockReset();
    global.fetch = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        result: {
          serializedTransaction: "AQIDBA==",
          estimatedFeeLamports: 5000,
          estimatedRentLamports: 0,
          usesDurableNonce: false,
        },
      }),
    })) as unknown as typeof fetch;
  });

  it("rejects unauthenticated requests with 401", async () => {
    verifyRequest.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ serializedTransaction: "AQIDBA==" }));
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed transactions with 400", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ serializedTransaction: "not*base64" }));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards sponsorship requests to the Solana host with the configured policy", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { POST } = await loadRoute();
    const res = await POST(makeReq({ serializedTransaction: "AQIDBA==", prefundRent: true }));
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0];
    expect(url).toContain("solana-mainnet.g.alchemy.com/v2/test-key");
    expect(JSON.parse(String(init.body))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "alchemy_requestFeePayer",
      params: [
        {
          policyId: "solana-policy",
          serializedTransaction: "AQIDBA==",
          prefundRent: true,
        },
      ],
    });
  });
});
