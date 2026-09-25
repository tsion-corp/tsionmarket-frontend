import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The proxy is the only thing between the browser and the user-management
// service. It holds the allowlist, demands a session on every method, judges
// the answer against the contract, and keeps three things out of the logs:
// the Privy DID, the caller's token and the push endpoint, which is a
// capability URL anybody holding it can push to.

const { verifyRequest, fetchMock } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  fetchMock: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ verifyRequest }));

const DID = "did:privy:cm1abcdef0000000000000000";
const ENCODED = encodeURIComponent(DID);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const BASE = "http://users.test";

const INBOX_PAGE = {
  items: [
    {
      id: "n-1",
      campaignId: "c-1",
      title: "Markets are open",
      body: "Trading starts in ten minutes.",
      url: "/perps",
      imageUrl: null,
      readAt: null,
      createdAt: "2026-09-21T09:00:00.000Z",
    },
  ],
  unreadCount: 1,
  nextCursor: null,
};

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123-capability-url";

const BALANCE = {
  generatedAt: "2026-09-23T15:11:29.600Z",
  staleAt: "2026-09-23T15:11:44.600Z",
  cached: false,
  chains: ["0x2105"],
  totalUsdValue: null,
  wallets: [
    {
      chain: "0x2105",
      address: "0x72f2578ade01ca5a844cb0a46dc1943bbd233aca",
      native: {
        symbol: "ETH",
        name: "Ether",
        decimals: 18,
        address: null,
        balance: "504709067444182",
        balanceFormatted: "0.000504709067444182",
        usdValue: null,
      },
      tokens: [],
      blockNumber: "51693471",
      slot: null,
    },
  ],
};

function upstream(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function ctx(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

function request(
  path: string[],
  { method = "GET", search = "", body }: { method?: string; search?: string; body?: string } = {}
) {
  const url = `http://app.test/api/user-management/${path.map(encodeURIComponent).join("/")}${search}`;
  return new NextRequest(url, {
    method,
    headers: { authorization: "Bearer caller-token", "content-type": "application/json" },
    body,
  });
}

let route: typeof import("./route");
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("USER_MANAGEMENT_API_URL", BASE);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(upstream({ success: true, data: INBOX_PAGE }));
  verifyRequest.mockReset();
  verifyRequest.mockResolvedValue({ userId: DID, sessionId: "s-1" });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  route = await import("./route");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  errorSpy.mockRestore();
});

describe("the allowed routes", () => {
  it("relays the inbox read", async () => {
    const path = ["users", DID, "notifications"];
    const res = await route.GET(request(path), ctx(path));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: INBOX_PAGE });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/users/${ENCODED}/notifications`);
    expect(init.method).toBe("GET");
    expect(init.headers.authorization).toBe("Bearer caller-token");
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("relays mark-read, the vapid key and both sides of the subscription", async () => {
    const cases = [
      {
        method: "POST" as const,
        path: ["users", DID, "notifications", "read"],
        data: { updated: 2 },
        upstreamPath: `users/${ENCODED}/notifications/read`,
      },
      {
        method: "GET" as const,
        path: ["users", DID, "push", "vapid-public-key"],
        data: { publicKey: "BPk-test" },
        upstreamPath: `users/${ENCODED}/push/vapid-public-key`,
      },
      {
        method: "POST" as const,
        path: ["users", DID, "push", "subscriptions"],
        data: { subscribed: true },
        upstreamPath: `users/${ENCODED}/push/subscriptions`,
      },
      {
        method: "DELETE" as const,
        path: ["users", DID, "push", "subscriptions"],
        data: { subscribed: false },
        upstreamPath: `users/${ENCODED}/push/subscriptions`,
      },
    ];

    for (const { method, path, data, upstreamPath } of cases) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(upstream({ success: true, data }));
      const res = await route[method](request(path, { method }), ctx(path));

      expect(res.status, `${method} ${upstreamPath}`).toBe(200);
      await expect(res.json()).resolves.toEqual({ success: true, data });
      expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/${upstreamPath}`);
      expect(fetchMock.mock.calls[0][1].method).toBe(method);
    }
  });

  it("forwards the query string verbatim, so an opaque cursor is sent back as received", async () => {
    const path = ["users", DID, "notifications"];
    const search = "?limit=20&cursor=2026-09-21T09%3A00%3A00.000Z";
    await route.GET(request(path, { search }), ctx(path));

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/users/${ENCODED}/notifications${search}`);
  });

  it("forwards the DELETE body, which is the only thing naming the endpoint to remove", async () => {
    const path = ["users", DID, "push", "subscriptions"];
    fetchMock.mockResolvedValue(upstream({ success: true, data: { subscribed: false } }));
    const body = JSON.stringify({ endpoint: ENDPOINT });
    await route.DELETE(request(path, { method: "DELETE", body }), ctx(path));

    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(body);
    expect(init.headers["content-type"]).toBe("application/json");
  });

  it("relays the balance read and hands the payload back untouched", async () => {
    fetchMock.mockResolvedValue(upstream({ success: true, data: BALANCE }));
    const path = ["users", DID, "balance"];
    const res = await route.GET(request(path), ctx(path));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true, data: BALANCE });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/users/${ENCODED}/balance`);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  // The allowlist admitted it; the schema has to judge it. A balance that
  // relayed unjudged would be the fail-open this change exists to close.
  it("judges the balance against the contract rather than relaying it unjudged", async () => {
    fetchMock.mockResolvedValue(
      upstream({
        success: true,
        data: { ...BALANCE, wallets: [{ ...BALANCE.wallets[0], blockNumber: 51693471 }] },
      })
    );
    const path = ["users", DID, "balance"];
    const res = await route.GET(request(path), ctx(path));

    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("BAD_RESPONSE");
  });

  it("never caches an answer, because every one of them is private to one user", async () => {
    const path = ["users", DID, "notifications"];
    const res = await route.GET(request(path), ctx(path));
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
});

describe("what the proxy refuses", () => {
  it("refuses an allowed path asked for with the wrong method", async () => {
    const path = ["users", DID, "notifications"];
    const res = await route.POST(request(path, { method: "POST", body: "{}" }), ctx(path));

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The admin surface needs x-admin-api-key, which this app must never hold.
  it("refuses /admin/users on every method", async () => {
    for (const method of ["GET", "POST", "DELETE"] as const) {
      const path = ["admin", "users"];
      const res = await route[method](request(path, { method }), ctx(path));
      expect(res.status, `${method} admin/users`).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a did carrying a path separator or a traversal", async () => {
    for (const did of ["did:privy:abc/../../admin/users", "..", "did:privy:abc/extra"]) {
      const path = ["users", did, "notifications"];
      const res = await route.GET(request(path), ctx(path));
      expect(res.status, `did ${did}`).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 401 without a session, and spends no upstream call", async () => {
    verifyRequest.mockResolvedValue(null);
    const path = ["users", DID, "notifications"];
    const res = await route.GET(request(path), ctx(path));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 401 on every method without a session", async () => {
    verifyRequest.mockResolvedValue(null);
    const read = ["users", DID, "notifications", "read"];
    const subs = ["users", DID, "push", "subscriptions"];
    expect((await route.POST(request(read, { method: "POST" }), ctx(read))).status).toBe(401);
    expect((await route.DELETE(request(subs, { method: "DELETE" }), ctx(subs))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The proxy forwards the caller's own token, so what stopped person A asking
  // for person B's rows was the upstream 403 and nothing on this side. In
  // front of wallet balances that is not enough: the did in the path must be
  // the one the verified session names.
  it("answers 403 when the session names a different user than the path does", async () => {
    verifyRequest.mockResolvedValue({
      userId: "did:privy:someone-else-entirely",
      sessionId: "s-2",
    });
    const path = ["users", DID, "notifications"];
    const res = await route.GET(request(path), ctx(path));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { code: "FORBIDDEN" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a mismatched did on every method and every route", async () => {
    verifyRequest.mockResolvedValue({
      userId: "did:privy:someone-else-entirely",
      sessionId: "s-2",
    });
    const cases = [
      { method: "GET" as const, path: ["users", DID, "notifications"] },
      { method: "GET" as const, path: ["users", DID, "balance"] },
      { method: "GET" as const, path: ["users", DID, "push", "vapid-public-key"] },
      { method: "POST" as const, path: ["users", DID, "notifications", "read"] },
      { method: "POST" as const, path: ["users", DID, "push", "subscriptions"] },
      { method: "DELETE" as const, path: ["users", DID, "push", "subscriptions"] },
    ];
    for (const { method, path } of cases) {
      const body = method === "GET" ? undefined : "{}";
      const res = await route[method](request(path, { method, body }), ctx(path));
      expect(res.status, `${method} ${path.join("/")}`).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The allowlist hands back the did percent-encoded as one URL segment. The
  // claim is the raw `sub`, so comparing against the encoded form would refuse
  // every legitimate caller — `:` alone encodes to `%3A`.
  it("compares the raw did, not the encoded one the allowlist returns", async () => {
    verifyRequest.mockResolvedValue({ userId: DID, sessionId: "s-1" });
    const path = ["users", DID, "notifications"];
    const res = await route.GET(request(path), ctx(path));

    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/users/${ENCODED}/notifications`);
  });

  // A DID's method-specific id is case-sensitive, and the upstream compares it
  // to `sub` exactly. Folding case here would admit a request the service
  // refuses and would be the only place in the stack that did.
  it("refuses a did that differs from the claim only in case", async () => {
    verifyRequest.mockResolvedValue({ userId: DID.toUpperCase(), sessionId: "s-1" });
    const path = ["users", DID, "notifications"];
    const res = await route.GET(request(path), ctx(path));

    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 503 when no service url is configured", async () => {
    vi.resetModules();
    vi.stubEnv("USER_MANAGEMENT_API_URL", "");
    vi.stubEnv("WSAPI_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_WSAPI_BASE_URL", "");
    vi.doMock("@/lib/wsapi-base", () => ({ wsapiService: () => "" }));
    const unconfigured = await import("./route");
    const path = ["users", DID, "notifications"];
    const res = await unconfigured.GET(request(path), ctx(path));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { code: "NOT_CONFIGURED" },
    });
    vi.doUnmock("@/lib/wsapi-base");
  });
});

describe("what the upstream answers", () => {
  // Slice D branches on these two: a 409 means the server has no VAPID keys
  // and push renders as unavailable, a 400 means the subscription was
  // rejected. Flattening either into a 502 would lose that.
  it("passes a 409 from subscribe through untouched", async () => {
    const failure = {
      success: false,
      error: { code: "NOT_CONFIGURED", message: "web push is not configured" },
    };
    fetchMock.mockResolvedValue(upstream(failure, 409));
    const path = ["users", DID, "push", "subscriptions"];
    const res = await route.POST(request(path, { method: "POST", body: "{}" }), ctx(path));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual(failure);
  });

  it("passes a 400 for an invalid subscription through untouched", async () => {
    const failure = { success: false, error: { code: "BAD_REQUEST", message: "invalid keys" } };
    fetchMock.mockResolvedValue(upstream(failure, 400));
    const path = ["users", DID, "push", "subscriptions"];
    const res = await route.POST(request(path, { method: "POST", body: "{}" }), ctx(path));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual(failure);
  });

  it("keeps the status when a client error arrives with no envelope to pass on", async () => {
    fetchMock.mockResolvedValue(new Response("<html>nope</html>", { status: 409 }));
    const path = ["users", DID, "push", "subscriptions"];
    const res = await route.POST(request(path, { method: "POST", body: "{}" }), ctx(path));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.requestId).toMatch(UUID);
  });

  it("turns a drifted answer into a 502 with a request id rather than handing it to a component", async () => {
    fetchMock.mockResolvedValue(
      upstream({ success: true, data: { items: "not a list", unreadCount: 1, nextCursor: null } })
    );
    const path = ["users", DID, "notifications"];
    const res = await route.GET(request(path), ctx(path));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_RESPONSE");
    expect(body.error.requestId).toMatch(UUID);
    expect(res.headers.get("x-request-id")).toBe(body.error.requestId);
  });

  it("turns an answer that is not JSON at all into the same 502", async () => {
    fetchMock.mockResolvedValue(new Response("<html>gateway</html>", { status: 200 }));
    const path = ["users", DID, "push", "vapid-public-key"];
    const res = await route.GET(request(path), ctx(path));

    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("BAD_RESPONSE");
  });

  it("turns a server-side upstream failure into a 502", async () => {
    fetchMock.mockResolvedValue(upstream({ success: false, error: { code: "BOOM" } }, 500));
    const path = ["users", DID, "notifications"];
    const res = await route.GET(request(path), ctx(path));

    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("UPSTREAM_ERROR");
  });

  it("turns an unreachable service into a 502 with a request id", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const path = ["users", DID, "notifications"];
    const res = await route.GET(request(path), ctx(path));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("UPSTREAM_ERROR");
    expect(body.error.requestId).toMatch(UUID);
  });
});

// A push endpoint is a capability URL and the DID names the person. Neither,
// nor the token, may reach a log line.
describe("what the proxy logs", () => {
  // One handler serves the inbox, push and balances, so a message naming any
  // one of them tells the reader about the wrong feature.
  it("says nothing about notifications when a balance read fails", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const path = ["users", DID, "balance"];
    const res = await route.GET(request(path), ctx(path));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error.code).toBe("UPSTREAM_ERROR");
    expect(body.error.message).not.toMatch(/notification/iu);
  });

  it("names no feature in any failure message it writes itself", async () => {
    const path = ["users", DID, "notifications"];
    const seen: string[] = [];

    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    seen.push((await (await route.GET(request(path), ctx(path))).json()).error.message);

    fetchMock.mockResolvedValue(new Response("<html>gateway</html>", { status: 200 }));
    seen.push((await (await route.GET(request(path), ctx(path))).json()).error.message);

    fetchMock.mockResolvedValue(new Response("<html>nope</html>", { status: 409 }));
    seen.push((await (await route.GET(request(path), ctx(path))).json()).error.message);

    for (const message of seen) {
      expect(message, message).not.toMatch(/notification|push|balance/iu);
    }
  });

  // routeLabel scrubs the did by position, replacing segment index 1, so it
  // covers a tail it has never seen. Confirmed on the new one rather than
  // assumed.
  it("names the route shape and never the did, the token or the endpoint", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const path = ["users", DID, "push", "subscriptions"];
    await route.POST(
      request(path, { method: "POST", body: JSON.stringify({ endpoint: ENDPOINT }) }),
      ctx(path)
    );

    fetchMock.mockResolvedValue(upstream({ success: true, data: { subscribed: "yes" } }));
    await route.POST(
      request(path, { method: "POST", body: JSON.stringify({ endpoint: ENDPOINT }) }),
      ctx(path)
    );

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toContain(DID);
    expect(logged).not.toContain(ENCODED);
    expect(logged).not.toContain(ENDPOINT);
    expect(logged).not.toContain("caller-token");
    expect(logged).toContain("push/subscriptions");
  });

  it("scrubs the did out of a balance log line too, by position", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const path = ["users", DID, "balance"];
    await route.GET(request(path), ctx(path));

    const logged = errorSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toContain(DID);
    expect(logged).not.toContain(ENCODED);
    expect(logged).toContain("users/:user/balance");
  });
});
