import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  getRequestUser: vi.fn(),
  getRequestIdentity: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({
  ...auth,
  ACCESS_TOKEN_COOKIE: "privy-token",
  DECANE_ACCESS_TOKEN_COOKIE: "decane-token",
  // Mirrors the real helper: either provider's cookie authenticates, which is
  // what lets an <iframe src="/api/chess/play"> navigation carry a session at
  // all — it can attach no Authorization header.
  accessTokenFromCookie: (read: (name: string) => string | undefined) =>
    read("privy-token") ?? read("decane-token") ?? null,
}));

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

function mockRedirectingUpstream(location: string): void {
  global.fetch = vi.fn(async (input: string | URL | Request) => {
    if (String(input).endsWith("/ready")) {
      return new Response(JSON.stringify({ ready: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("", { status: 303, headers: { location } });
  }) as unknown as typeof fetch;
}

async function loadRoute(
  env: { chessApiUrl?: string; publicChessApiUrl?: string; wsapiBaseUrl?: string } = {}
) {
  vi.resetModules();
  if (env.chessApiUrl) process.env.CHESS_API_URL = env.chessApiUrl;
  else delete process.env.CHESS_API_URL;
  process.env.NEXT_PUBLIC_CHESS_API_URL = env.publicChessApiUrl ?? "https://chess.test";
  process.env.WSAPI_BASE_URL = env.wsapiBaseUrl ?? "https://gateway.test";
  delete process.env.NEXT_PUBLIC_WSAPI_BASE_URL;
  return import("@/app/api/chess/[...path]/route");
}

describe("chess proxy route", () => {
  beforeEach(() => {
    auth.verifyRequest.mockReset();
    auth.getRequestUser.mockReset();
    auth.getRequestIdentity.mockReset();
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

  it("prefers the server-only chess url during development", async () => {
    vi.stubEnv("NODE_ENV", "development");

    try {
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
    } finally {
      vi.unstubAllEnvs();
    }
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

  it("pins deployed chess requests to the production gateway", async () => {
    vi.stubEnv("NODE_ENV", "production");
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });

    try {
      const { GET } = await loadRoute({
        chessApiUrl: "https://stale-server-chess.test",
        publicChessApiUrl: "https://legacy-chess.test",
        wsapiBaseUrl: "https://staging.test",
      });
      const res = await GET(makeReq("https://app.test/api/chess/play?setup=hook"), {
        params: Promise.resolve({ path: ["play"] }),
      });

      expect(res.status).toBe(200);
      const [url] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
        .calls[0];
      expect(url).toBe("https://api.tsionark.com/v1/chess/play?setup=hook");
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
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });
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

  it("authenticates server-rendered challenge pages and preserves their route prefix", async () => {
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });
    const { GET } = await loadRoute();
    const res = await GET(makeReq("https://app.test/api/chess/challenge"), {
      params: Promise.resolve({ path: ["challenge"] }),
    });

    expect(res.status).toBe(200);
    const [, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(init.headers).toMatchObject({
      "x-wallet-address": "0xabc",
      "x-forwarded-prefix": "/api/chess",
    });
  });

  it("never shares viewer-specific challenge pages through the read cache", async () => {
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser
      .mockResolvedValueOnce(walletUser("0xaaa"))
      .mockResolvedValueOnce(walletUser("0xbbb"));
    auth.getRequestIdentity
      .mockResolvedValueOnce({ userId: "user_1", evmAddress: "0xaaa", solanaAddress: null })
      .mockResolvedValueOnce({ userId: "user_1", evmAddress: "0xbbb", solanaAddress: null });
    const { GET } = await loadRoute();
    const request = () => makeReq("https://app.test/api/chess/challenge/challenge-1");
    const context = { params: Promise.resolve({ path: ["challenge", "challenge-1"] }) };

    expect((await GET(request(), context)).status).toBe(200);
    expect((await GET(request(), context)).status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("authenticates challenge lifecycle polling", async () => {
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });
    const { GET } = await loadRoute();

    const res = await GET(makeReq("https://app.test/api/chess/challenges/challenge-1"), {
      params: Promise.resolve({ path: ["challenges", "challenge-1"] }),
    });

    expect(res.status).toBe(200);
    const [, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(init.headers).toMatchObject({ "x-wallet-address": "0xabc" });
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
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });
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
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });
    const { GET } = await loadRoute();
    const res = await GET(makeReq("https://app.test/api/chess/cashier/players/0xstale/balance"), {
      params: Promise.resolve({ path: ["cashier", "players", "0xstale", "balance"] }),
    });

    expect(res.status).toBe(200);
    const [, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect((init.headers as Record<string, string>)["x-wallet-address"]).toBe("0xabc");
  });

  it("forwards signed Privy credentials on authenticated lottery reads", async () => {
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    ) as unknown as typeof fetch;
    const { GET } = await loadRoute();
    const res = await GET(
      makeReq("https://app.test/api/chess/lottery/players/0xabc/tickets?limit=50", {
        headers: {
          authorization: "Bearer access-token",
          "privy-id-token": "identity-token",
        },
      }),
      { params: Promise.resolve({ path: ["lottery", "players", "0xabc", "tickets"] }) }
    );

    expect(res.status).toBe(200);
    const [, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0];
    expect(init.headers).toMatchObject({
      authorization: "Bearer access-token",
      "privy-id-token": "identity-token",
      "x-wallet-address": "0xabc",
    });
  });

  it("rejects writes until the proxy can prove the caller's wallet", async () => {
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
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
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });
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
    const [, init] = (
      global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls.find(([url]) => url.endsWith("/betting/bets"))!;
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

  it("opens server-created computer games in the interactive chess board", async () => {
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue({
      linked_accounts: [
        ...walletUser("0xabc").linked_accounts,
        { type: "google_oauth", name: "Alice" },
      ],
    });
    // The display name still comes off the Privy user; only the wallet moved
    // to the provider-agnostic identity.
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });
    mockRedirectingUpstream("/round/game-1");
    const { POST } = await loadRoute();

    const res = await POST(
      makeReq("https://app.test/api/chess/play/computer", {
        body: "level=3&color=random",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: "Bearer access-token",
          "privy-id-token": "identity-token",
          "x-vercel-ip-country": "US",
        },
      }),
      { params: Promise.resolve({ path: ["play", "computer"] }) }
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/api/chess/round/game-1");
    const [, init] = (
      global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls.find(([url]) => url.endsWith("/play/computer"))!;
    expect(init.body).toBe("level=3&color=random");
    expect(init.headers).toMatchObject({
      authorization: "Bearer access-token",
      "privy-id-token": "identity-token",
      "x-wallet-address": "0xabc",
      "x-forwarded-prefix": "/api/chess",
    });
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>)["x-player-display-name-b64"]).toBeTruthy();
  });

  it("opens created challenges on a refreshable frontend invite route", async () => {
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });
    mockRedirectingUpstream("/challenge/challenge-1");
    const { POST } = await loadRoute();

    const res = await POST(
      makeReq("https://app.test/api/chess/challenge", {
        body: "time_control=300%2B3&mode=rated&color=random",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      { params: Promise.resolve({ path: ["challenge"] }) }
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/api/chess/challenge/challenge-1");
    const [, init] = (
      global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }
    ).mock.calls.find(([url]) => url.endsWith("/challenge"))!;
    expect(init.redirect).toBe("manual");
    expect(init.headers).toMatchObject({ "x-forwarded-prefix": "/api/chess" });
  });

  it("opens funded challenge redirects on the same refreshable invite route", async () => {
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });
    mockRedirectingUpstream("/challenge/funded/challenge-2");
    const { POST } = await loadRoute();

    const res = await POST(
      makeReq("https://app.test/api/chess/challenge", {
        body: "time_control=300%2B3&mode=rated&color=random&stake_usdc=5",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
      { params: Promise.resolve({ path: ["challenge"] }) }
    );

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/api/chess/challenge/funded/challenge-2");
  });

  it("opens accepted friend challenges on the interactive board", async () => {
    auth.verifyRequest.mockResolvedValue({ provider: "privy", userId: "user_1" });
    auth.getRequestUser.mockResolvedValue(walletUser("0xabc"));
    auth.getRequestIdentity.mockResolvedValue({
      userId: "user_1",
      evmAddress: "0xabc",
      solanaAddress: null,
    });
    mockRedirectingUpstream("/round/game-1");
    const { POST } = await loadRoute();

    const res = await POST(makeReq("https://app.test/api/chess/challenge/challenge-1/accept"), {
      params: Promise.resolve({ path: ["challenge", "challenge-1", "accept"] }),
    });

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/api/chess/round/game-1");
  });
});
