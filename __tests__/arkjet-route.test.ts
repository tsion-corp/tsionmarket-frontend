import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => auth);

function makeReq(
  url: string,
  init: { body?: string; headers?: Record<string, string> } = {}
): NextRequest {
  return {
    nextUrl: new URL(url),
    headers: new Headers(init.headers),
    cookies: { get: vi.fn(() => undefined) },
    text: async () => init.body ?? "",
  } as unknown as NextRequest;
}

async function loadRoute() {
  vi.resetModules();
  process.env.ARKJET_API_URL = "http://127.0.0.1:8096";
  return import("@/app/api/arkjet/[...path]/route");
}

function forwardedCalls(): [string, RequestInit][] {
  return (
    global.fetch as unknown as {
      mock: { calls: [string, RequestInit][] };
    }
  ).mock.calls.filter(([url]) => !url.endsWith("/ready"));
}

describe("arkjet proxy route", () => {
  beforeEach(() => {
    auth.verifyRequest.mockReset();
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    ) as unknown as typeof fetch;
  });

  it("keeps current rounds public", async () => {
    const { GET } = await loadRoute();
    const response = await GET(makeReq("https://app.test/api/arkjet/rounds/current"), {
      params: Promise.resolve({ path: ["rounds", "current"] }),
    });

    expect(response.status).toBe(200);
    expect(auth.verifyRequest).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("keeps the published risk and minimum-bet contract public", async () => {
    const { GET } = await loadRoute();
    const response = await GET(makeReq("https://app.test/api/arkjet/risk/rules"), {
      params: Promise.resolve({ path: ["risk", "rules"] }),
    });

    expect(response.status).toBe(200);
    expect(auth.verifyRequest).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8096/risk/rules",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("requires a Privy session for player balances", async () => {
    auth.verifyRequest.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const response = await GET(makeReq("https://app.test/api/arkjet/bets/balance"), {
      params: Promise.resolve({ path: ["bets", "balance"] }),
    });

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("keeps funding configuration public but protects money movement", async () => {
    const { GET, POST } = await loadRoute();
    const config = await GET(makeReq("https://app.test/api/arkjet/funding/config"), {
      params: Promise.resolve({ path: ["funding", "config"] }),
    });

    auth.verifyRequest.mockResolvedValue(null);
    const withdrawal = await POST(
      makeReq("https://app.test/api/arkjet/funding/withdrawals", {
        body: JSON.stringify({
          amount: "10.00",
          idempotencyKey: "273277c1-ae45-4872-9025-6322b0d25a66",
        }),
      }),
      { params: Promise.resolve({ path: ["funding", "withdrawals"] }) }
    );

    expect(config.status).toBe(200);
    expect(withdrawal.status).toBe(401);
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("forwards the withdrawal idempotency key with Privy identity", async () => {
    auth.verifyRequest.mockResolvedValue({ userId: "did:privy:user-1" });
    const body = JSON.stringify({
      amount: "10.00",
      idempotencyKey: "273277c1-ae45-4872-9025-6322b0d25a66",
    });
    const { POST } = await loadRoute();
    const response = await POST(
      makeReq("https://app.test/api/arkjet/funding/withdrawals", {
        body,
        headers: {
          authorization: "Bearer access-token",
          "privy-id-token": "identity-token",
        },
      }),
      { params: Promise.resolve({ path: ["funding", "withdrawals"] }) }
    );

    expect(response.status).toBe(200);
    const [url, init] = forwardedCalls()[0];
    expect(url).toBe("http://127.0.0.1:8096/funding/withdrawals");
    expect(init.body).toBe(body);
    expect(init.headers).toMatchObject({
      authorization: "Bearer access-token",
      "privy-id-token": "identity-token",
      "content-type": "application/json",
    });
  });

  it("forwards Privy identity when confirming a deposit", async () => {
    auth.verifyRequest.mockResolvedValue({ userId: "did:privy:user-1" });
    const body = JSON.stringify({ txHash: `0x${"a".repeat(64)}` });
    const { POST } = await loadRoute();
    const response = await POST(
      makeReq("https://app.test/api/arkjet/funding/deposits/confirm", {
        body,
        headers: {
          authorization: "Bearer access-token",
          "privy-id-token": "identity-token",
        },
      }),
      { params: Promise.resolve({ path: ["funding", "deposits", "confirm"] }) }
    );

    expect(response.status).toBe(200);
    const [url, init] = forwardedCalls()[0];
    expect(url).toBe("http://127.0.0.1:8096/funding/deposits/confirm");
    expect(init.body).toBe(body);
    expect(init.headers).toMatchObject({
      authorization: "Bearer access-token",
      "privy-id-token": "identity-token",
    });
  });

  it("forwards both Privy credentials and the exact bet body", async () => {
    auth.verifyRequest.mockResolvedValue({ userId: "did:privy:user-1" });
    const body = JSON.stringify({
      roundId: "4c9a7d0a-7f5b-4a7c-9bbf-f55b3b371ef5",
      panelId: "A",
      amount: "10.00",
      currency: "NGN",
      idempotencyKey: "0c6ed233-a5ec-42d5-aa51-5dbd9166af98",
    });
    const { POST } = await loadRoute();
    const response = await POST(
      makeReq("https://app.test/api/arkjet/bets", {
        body,
        headers: {
          authorization: "Bearer access-token",
          "privy-id-token": "identity-token",
        },
      }),
      { params: Promise.resolve({ path: ["bets"] }) }
    );

    expect(response.status).toBe(200);
    const [url, init] = forwardedCalls()[0];
    expect(url).toBe("http://127.0.0.1:8096/bets");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
    expect(init.headers).toMatchObject({
      authorization: "Bearer access-token",
      "privy-id-token": "identity-token",
      "content-type": "application/json",
    });
  });

  it("allows authenticated cashout and cancellation routes", async () => {
    auth.verifyRequest.mockResolvedValue({ userId: "did:privy:user-1" });
    const betId = "982a26a6-c5ea-42ad-b2cf-dad96b407bdf";
    const { DELETE, POST } = await loadRoute();

    const cashout = await POST(
      makeReq(`https://app.test/api/arkjet/bets/${betId}/cashout`, {
        headers: { authorization: "Bearer access-token" },
      }),
      { params: Promise.resolve({ path: ["bets", betId, "cashout"] }) }
    );
    const cancellation = await DELETE(
      makeReq(`https://app.test/api/arkjet/bets/${betId}`, {
        headers: { authorization: "Bearer access-token" },
      }),
      { params: Promise.resolve({ path: ["bets", betId] }) }
    );

    expect(cashout.status).toBe(200);
    expect(cancellation.status).toBe(200);
    expect(forwardedCalls()).toHaveLength(2);
  });

  it("rejects unlisted bet paths", async () => {
    const { GET } = await loadRoute();
    const response = await GET(makeReq("https://app.test/api/arkjet/bets/admin"), {
      params: Promise.resolve({ path: ["bets", "admin"] }),
    });

    expect(response.status).toBe(404);
    expect(auth.verifyRequest).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
