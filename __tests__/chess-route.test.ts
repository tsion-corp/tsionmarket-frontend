import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  getRequestUser: vi.fn(),
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

function walletUser(address: string) {
  return {
    linked_accounts: [
      {
        type: "wallet",
        chain_type: "ethereum",
        address,
      },
    ],
  };
}

async function loadRoute() {
  vi.resetModules();
  process.env.NEXT_PUBLIC_CHESS_API_URL = "https://chess.test";
  return import("@/app/api/chess/[...path]/route");
}

describe("chess proxy route", () => {
  beforeEach(() => {
    auth.verifyRequest.mockReset();
    auth.getRequestUser.mockReset();
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    ) as unknown as typeof fetch;
  });

  it("keeps public board reads open", async () => {
    const { GET } = await loadRoute();
    const res = await GET(makeReq("https://app.test/api/chess/matches?status=waiting"), {
      params: Promise.resolve({ path: ["matches"] }),
    });

    expect(res.status).toBe(200);
    expect(auth.verifyRequest).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("keeps cashier config public", async () => {
    const { GET } = await loadRoute();
    const res = await GET(makeReq("https://app.test/api/chess/cashier/config"), {
      params: Promise.resolve({ path: ["cashier", "config"] }),
    });

    expect(res.status).toBe(200);
    expect(auth.verifyRequest).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("requires a session for private chess reads", async () => {
    auth.verifyRequest.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET(makeReq("https://app.test/api/chess/cashier/players/0xabc/balance"), {
      params: Promise.resolve({ path: ["cashier", "players", "0xabc", "balance"] }),
    });

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards the verified wallet on private chess reads", async () => {
    auth.verifyRequest.mockResolvedValue({ userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    const { GET } = await loadRoute();
    const res = await GET(makeReq("https://app.test/api/chess/cashier/players/0xstale/balance"), {
      params: Promise.resolve({ path: ["cashier", "players", "0xstale", "balance"] }),
    });

    expect(res.status).toBe(200);
    const [, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect((init.headers as Record<string, string>)["x-wallet-address"]).toBe("0xabc");
  });

  it("rejects writes until the proxy can prove the caller's wallet", async () => {
    auth.verifyRequest.mockResolvedValue({ userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(null);
    const { POST } = await loadRoute();
    const res = await POST(
      makeReq("https://app.test/api/chess/matches/abc/join", {
        body: JSON.stringify({ player: "0xclaimed" }),
      }),
      { params: Promise.resolve({ path: ["matches", "abc", "join"] }) }
    );

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards the verified wallet in both header and body on writes", async () => {
    auth.verifyRequest.mockResolvedValue({ userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    const { POST } = await loadRoute();
    const res = await POST(
      makeReq("https://app.test/api/chess/betting/bets", {
        body: JSON.stringify({
          bettor: "0xclaimed",
          matchId: "match-1",
          outcome: "white",
          stakeUsdc: "5",
        }),
      }),
      { params: Promise.resolve({ path: ["betting", "bets"] }) }
    );

    expect(res.status).toBe(200);
    const [, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect((init.headers as Record<string, string>)["x-wallet-address"]).toBe("0xabc");
    expect(init.body).toBe(
      JSON.stringify({
        bettor: "0xabc",
        matchId: "match-1",
        outcome: "white",
        stakeUsdc: "5",
      })
    );
  });
});
