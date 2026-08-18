import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { verifyRequest } = vi.hoisted(() => ({ verifyRequest: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));

function makeReq(
  body: unknown,
  headers: Record<string, string> = {
    authorization: "Bearer access-token",
    "privy-id-token": "privy-id-token",
  }
): NextRequest {
  return {
    json: async () => body,
    headers: new Headers(headers),
    cookies: { get: () => undefined },
  } as unknown as NextRequest;
}

async function loadRoutes() {
  vi.resetModules();
  process.env.WSAPI_BASE_URL = "https://api.worldstreetwebservices.com";
  delete process.env.GAS_SPONSOR_API_URL;
  return {
    alias: await import("@/app/api/alchemy-solana-sponsor/route"),
    primary: await import("@/app/api/gas-sponsor/solana/route"),
  };
}

describe("solana sponsor routes", () => {
  beforeEach(() => {
    verifyRequest.mockReset();
    global.fetch = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        data: {
          sponsoredSerializedTransaction: "AQIDBA==",
          submittedSignature: "sig-123",
          prefundRent: true,
          signer: "direct-wallet",
          sponsorPublicKey: "Sponsor1111111111111111111111111111111111",
        },
      }),
    })) as unknown as typeof fetch;
  });

  it("rejects unauthenticated requests with 401", async () => {
    verifyRequest.mockResolvedValue(null);
    const { primary } = await loadRoutes();
    const { POST } = primary;
    const res = await POST(makeReq({ serializedTransaction: "AQIDBA==" }));
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects malformed transactions with 400", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { primary } = await loadRoutes();
    const { POST } = primary;
    const res = await POST(makeReq({ serializedTransaction: "not*base64" }));
    expect(res.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards sponsorship requests to the deployed gas sponsor backend", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { primary } = await loadRoutes();
    const { POST } = primary;
    const res = await POST(makeReq({ serializedTransaction: "AQIDBA==", prefundRent: true }));
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledOnce();
    const [url, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0];
    expect(url).toBe("https://api.worldstreetwebservices.com/v1/gas-sponsor/solana/sponsor");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      authorization: "Bearer access-token",
      "privy-id-token": "privy-id-token",
    });
    // Prepare already reassigned token-account rent to the sponsor. Submit
    // must not ask the backend to transfer another rent reserve to the user.
    expect(JSON.parse(String(init.body))).toEqual({ serializedTransaction: "AQIDBA==" });
  });

  it("keeps the old alias route wired to the same backend", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    const { alias } = await loadRoutes();
    const { POST } = alias;
    const res = await POST(makeReq({ serializedTransaction: "AQIDBA==" }));
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledOnce();
    const [url] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(url).toBe("https://api.worldstreetwebservices.com/v1/gas-sponsor/solana/sponsor");
  });

  it("prefers the dedicated gas sponsor override when provided", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    vi.resetModules();
    process.env.WSAPI_BASE_URL = "https://api.worldstreetwebservices.com";
    process.env.GAS_SPONSOR_API_URL = "http://127.0.0.1:8092";
    const { POST } = await import("@/app/api/gas-sponsor/solana/route");

    const res = await POST(makeReq({ serializedTransaction: "AQIDBA==" }));

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledOnce();
    const [url] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(url).toBe("http://127.0.0.1:8092/solana/sponsor");
  });

  it("normalizes upstream object errors into a readable message", async () => {
    verifyRequest.mockResolvedValue({ sub: "user" });
    global.fetch = vi.fn(async () => ({
      status: 503,
      ok: false,
      json: async () => ({
        success: false,
        error: { code: "SIMULATION_FAILED", message: "Token account is missing rent" },
      }),
    })) as unknown as typeof fetch;

    const { primary } = await loadRoutes();
    const { POST } = primary;
    const res = await POST(makeReq({ serializedTransaction: "AQIDBA==" }));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "Token account is missing rent" });
  });
});
