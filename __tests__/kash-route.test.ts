import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  getRequestUser: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => auth);

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

function makeReq(url: string, init: { body?: string } = {}): NextRequest {
  return {
    nextUrl: new URL(url),
    headers: new Headers(),
    cookies: { get: vi.fn(() => undefined) },
    text: async () => init.body ?? "",
  } as unknown as NextRequest;
}

function walletUser(address: string) {
  return {
    linked_accounts: [{ type: "wallet", chain_type: "ethereum", address }],
  };
}

async function loadRoute() {
  vi.resetModules();
  process.env.KASH_API_URL = "http://kash.test";
  return import("@/app/api/kash/[...path]/route");
}

function signIn(address: string) {
  auth.verifyRequest.mockResolvedValue({ userId: "user-1" });
  auth.getRequestUser.mockResolvedValue(walletUser(address));
}

describe("kash proxy route", () => {
  beforeEach(() => {
    auth.verifyRequest.mockReset();
    auth.getRequestUser.mockReset();
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
    ) as unknown as typeof fetch;
  });

  it("keeps status and quotes open to signed-out visitors", async () => {
    const { GET } = await loadRoute();
    for (const path of [["status"], ["purchases", "quote"], ["desk", "sell", "quote"]]) {
      const res = await GET(makeReq(`https://app.test/api/kash/${path.join("/")}?amount=10`), {
        params: Promise.resolve({ path }),
      });
      expect(res.status).toBe(200);
    }
    expect(auth.verifyRequest).not.toHaveBeenCalled();
  });

  it("rejects a signed-out account read with 401", async () => {
    auth.verifyRequest.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const res = await GET(makeReq(`https://app.test/api/kash/accounts/${WALLET}`), {
      params: Promise.resolve({ path: ["accounts", WALLET] }),
    });
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects reading another user's account with 403", async () => {
    signIn(WALLET);
    const { GET } = await loadRoute();
    const res = await GET(makeReq(`https://app.test/api/kash/accounts/${OTHER}`), {
      params: Promise.resolve({ path: ["accounts", OTHER] }),
    });
    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("lets the owner read their own account and ledger", async () => {
    signIn(WALLET.toUpperCase().replace("0X", "0x"));
    const { GET } = await loadRoute();
    for (const path of [
      ["accounts", WALLET],
      ["accounts", WALLET, "ledger"],
    ]) {
      const res = await GET(makeReq(`https://app.test/api/kash/${path.join("/")}`), {
        params: Promise.resolve({ path }),
      });
      expect(res.status).toBe(200);
    }
  });

  it("rejects a purchase for a wallet the session does not own", async () => {
    signIn(WALLET);
    const { POST } = await loadRoute();
    const res = await POST(
      makeReq("https://app.test/api/kash/purchases", {
        body: JSON.stringify({ wallet: OTHER, usdcAmount: "10" }),
      }),
      { params: Promise.resolve({ path: ["purchases"] }) }
    );
    expect(res.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards the owner's purchase upstream", async () => {
    signIn(WALLET);
    const { POST } = await loadRoute();
    const res = await POST(
      makeReq("https://app.test/api/kash/purchases", {
        body: JSON.stringify({ wallet: WALLET, usdcAmount: "10" }),
      }),
      { params: Promise.resolve({ path: ["purchases"] }) }
    );
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it("refuses paths outside the allowlist, including the demo endpoint", async () => {
    signIn(WALLET);
    const { GET, POST } = await loadRoute();

    const demo = await POST(
      makeReq("https://app.test/api/kash/activities", {
        body: JSON.stringify({ wallet: WALLET, type: "trade", notionalUsd: "200" }),
      }),
      { params: Promise.resolve({ path: ["activities"] }) }
    );
    expect(demo.status).toBe(404);

    const unknown = await GET(makeReq("https://app.test/api/kash/statuses"), {
      params: Promise.resolve({ path: ["statuses"] }),
    });
    expect(unknown.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("maps an unreachable engine to a 502 envelope", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    }) as unknown as typeof fetch;
    const { GET } = await loadRoute();
    const res = await GET(makeReq("https://app.test/api/kash/status"), {
      params: Promise.resolve({ path: ["status"] }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UPSTREAM_ERROR");
  });
});
