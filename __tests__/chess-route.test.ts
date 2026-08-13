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

async function loadRoute(env: { chessApiUrl?: string; publicChessApiUrl?: string } = {}) {
  vi.resetModules();
  if (env.chessApiUrl) process.env.CHESS_API_URL = env.chessApiUrl;
  else delete process.env.CHESS_API_URL;
  process.env.NEXT_PUBLIC_CHESS_API_URL = env.publicChessApiUrl ?? "https://chess.test";
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

  it("prefers the server-only chess url when both envs are set", async () => {
    const { GET } = await loadRoute({
      chessApiUrl: "http://127.0.0.1:18083",
      publicChessApiUrl: "https://prod-chess.test",
    });
    const res = await GET(makeReq("https://app.test/api/chess/cashier/config"), {
      params: Promise.resolve({ path: ["cashier", "config"] }),
    });

    expect(res.status).toBe(200);
    const [url] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(url).toBe("http://127.0.0.1:18083/cashier/config");
  });

  it("uses the Docker chess service by default in development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    try {
      const { GET } = await loadRoute({ publicChessApiUrl: "https://prod-chess.test" });
      const res = await GET(makeReq("https://app.test/api/chess/coach/catalog"), {
        params: Promise.resolve({ path: ["coach", "catalog"] }),
      });

      expect(res.status).toBe(200);
      const [url] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
        .calls[0];
      expect(url).toBe("http://127.0.0.1:8082/coach/catalog");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not cache failed upstream reads", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false }), {
          status: 404,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      ) as unknown as typeof fetch;
    const { GET } = await loadRoute();
    const request = () => makeReq("https://app.test/api/chess/coach/catalog");
    const context = { params: Promise.resolve({ path: ["coach", "catalog"] }) };

    expect((await GET(request(), context)).status).toBe(404);
    expect((await GET(request(), context)).status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("never caches player coach state", async () => {
    const { GET } = await loadRoute();
    const request = () => makeReq("https://app.test/api/chess/players/0xabc/coach/home");
    const context = { params: Promise.resolve({ path: ["players", "0xabc", "coach", "home"] }) };

    expect((await GET(request(), context)).status).toBe(200);
    expect((await GET(request(), context)).status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
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

  it("requires a session for match notes", async () => {
    auth.verifyRequest.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET(makeReq("https://app.test/api/chess/matches/match-1/note"), {
      params: Promise.resolve({ path: ["matches", "match-1", "note"] }),
    });

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("requires a session for player chat reads", async () => {
    auth.verifyRequest.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET(
      makeReq("https://app.test/api/chess/matches/match-1/chat?room=player&limit=100"),
      { params: Promise.resolve({ path: ["matches", "match-1", "chat"] }) }
    );

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards the verified wallet on match notes", async () => {
    auth.verifyRequest.mockResolvedValue({ userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    const { GET } = await loadRoute();
    const res = await GET(makeReq("https://app.test/api/chess/matches/match-1/note"), {
      params: Promise.resolve({ path: ["matches", "match-1", "note"] }),
    });

    expect(res.status).toBe(200);
    const [, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect((init.headers as Record<string, string>)["x-wallet-address"]).toBe("0xabc");
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
