import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), fetch: vi.fn() }));

vi.mock("@/lib/server/auth", () => ({
  verifyRequest: vi.fn(),
  accessTokenFromCookie: (read: (name: string) => string | undefined) =>
    read("decane-token") ?? null,
  verifyPrivyAccessToken: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));

const { GET, POST, PUT, DELETE } = await import("./route");

const DECANE = "decane-access-token";
const CLERK = "clerk-session-token";
const SERVICE = "http://127.0.0.1:8101";

function call(
  handler: typeof GET,
  method: string,
  path: string[],
  options: { headers?: Record<string, string>; body?: string } = {}
) {
  const url = `http://localhost:3000/api/wallet-upgrade/wallet/${path.join("/")}`;
  const req = new NextRequest(url, {
    method,
    headers: options.headers ?? { authorization: `Bearer ${DECANE}` },
    ...(options.body !== undefined ? { body: options.body } : {}),
  });
  return handler(req, { params: Promise.resolve({ path }) });
}

function env(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    NEXT_PUBLIC_DEPLOY_ENV: "development",
    NEXT_PUBLIC_WALLET_UPGRADE_ENABLED: "true",
    NEXT_PUBLIC_CRYPTO_BACKEND_ENABLED: "true",
    CRYPTO_WALLET_API_URL: SERVICE,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

const upstreamOk = () =>
  mocks.fetch.mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 })
  );

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
  upstreamOk();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("the wallet proxy, with Decane as the sign-in (the default)", () => {
  it("forwards the caller's Decane bearer to the wallet service and returns its answer", async () => {
    env();
    const res = await call(GET, "GET", ["me"]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { ok: true } });
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(url).toBe(`${SERVICE}/wallets/me`);
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${DECANE}`);
    expect(mocks.auth).not.toHaveBeenCalled(); // Clerk is not consulted
  });

  it("also reads the session from the Decane cookie, as the other routes do", async () => {
    env();
    const req = new NextRequest("http://localhost:3000/api/wallet-upgrade/wallet/me", {
      headers: { cookie: "decane-token=cookie-token" },
    });
    await GET(req, { params: Promise.resolve({ path: ["me"] }) });
    const [, init] = mocks.fetch.mock.calls[0]!;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer cookie-token");
  });

  it("turns away a caller with no session, without calling the service", async () => {
    env();
    const res = await call(GET, "GET", ["me"], { headers: {} });
    expect(res.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("maps each call the client makes, bodies included", async () => {
    env();
    await call(POST, "POST", [], { body: '{"a":1}' });
    await call(POST, "POST", ["me", "challenges"], { body: '{"purpose":"create"}' });
    await call(PUT, "PUT", ["me", "package"], { body: "{}" });
    await call(POST, "POST", ["me", "devices"], { body: "{}" });
    await call(DELETE, "DELETE", ["me", "devices", "d-1"], { body: "{}" });
    expect(mocks.fetch.mock.calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      `POST ${SERVICE}/wallets`,
      `POST ${SERVICE}/wallets/me/challenges`,
      `PUT ${SERVICE}/wallets/me/package`,
      `POST ${SERVICE}/wallets/me/devices`,
      `DELETE ${SERVICE}/wallets/me/devices/d-1`,
    ]);
    expect(mocks.fetch.mock.calls[0]![1].body).toBe('{"a":1}');
  });

  it("refuses paths the client has no business calling", async () => {
    env();
    for (const path of [["internal", "users", "x", "wallet-addresses"], ["health"], ["..", "me"]]) {
      expect((await call(GET, "GET", path)).status).toBe(404);
    }
    expect((await call(POST, "POST", ["me"], { body: "{}" })).status).toBe(404);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses an oversized body", async () => {
    env();
    const res = await call(POST, "POST", [], { body: "x".repeat(400 * 1024) });
    expect(res.status).toBe(413);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("is off unless the wallet backend is switched on and configured", async () => {
    env({ NEXT_PUBLIC_CRYPTO_BACKEND_ENABLED: "false" });
    expect((await call(GET, "GET", ["me"])).status).toBe(503);
    vi.unstubAllEnvs();
    env({ CRYPTO_WALLET_API_URL: "" });
    const res = await call(GET, "GET", ["me"]);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("NOT_CONFIGURED");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("keeps development away from a production wallet service unless told otherwise", async () => {
    env({ CRYPTO_WALLET_API_URL: "https://api.tsionark.com" });
    const refused = await call(GET, "GET", ["me"]);
    expect(refused.status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
    vi.stubEnv("WALLET_UPGRADE_ALLOW_PROD_UPSTREAM", "true");
    expect((await call(GET, "GET", ["me"])).status).toBe(200);
  });

  it("answers 502 in the usual envelope when the service is unreachable", async () => {
    env();
    mocks.fetch.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const res = await call(GET, "GET", ["me"]);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("UPSTREAM_ERROR");
  });
});

describe("the wallet proxy, with the parked Clerk path switched on", () => {
  it("uses the Clerk session and ignores a Decane bearer", async () => {
    env({
      NEXT_PUBLIC_WALLET_UPGRADE_AUTH: "clerk",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
    });
    mocks.auth.mockResolvedValue({ userId: "user_1", getToken: async () => CLERK });
    await call(GET, "GET", ["me"]);
    const [, init] = mocks.fetch.mock.calls[0]!;
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${CLERK}`);
  });

  it("turns away a caller with no Clerk session", async () => {
    env({
      NEXT_PUBLIC_WALLET_UPGRADE_AUTH: "clerk",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
    });
    mocks.auth.mockResolvedValue({ userId: null, getToken: async () => null });
    const res = await call(GET, "GET", ["me"]);
    expect(res.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
