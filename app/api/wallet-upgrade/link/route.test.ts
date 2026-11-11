import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  auth: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  verifyRequest: mocks.verifyRequest,
  accessTokenFromCookie: (read: (name: string) => string | undefined) =>
    read("decane-token") ?? null,
  verifyPrivyAccessToken: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));

const { POST } = await import("./route");

const DECANE = "decane-access-token";
const CLERK = "clerk-session-token";

function request(headers: Record<string, string> = { authorization: `Bearer ${DECANE}` }) {
  return new NextRequest("http://localhost:3000/api/wallet-upgrade/link", {
    method: "POST",
    headers,
  });
}

function env(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    NEXT_PUBLIC_DEPLOY_ENV: "development",
    NEXT_PUBLIC_WALLET_UPGRADE_ENABLED: "true",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
    MIGRATION_SERVICE_ENABLED: "1",
    MIGRATION_API_URL: "http://localhost:8094",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

beforeEach(() => {
  env();
  mocks.verifyRequest.mockResolvedValue({ provider: "decane", userId: "uid-1" });
  mocks.auth.mockResolvedValue({ userId: "user_1", getToken: async () => CLERK });
  mocks.fetch.mockResolvedValue(
    new Response(JSON.stringify({ success: true, data: { linked: true } }), { status: 200 })
  );
  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("POST /api/wallet-upgrade/link", () => {
  it("sends the service BOTH proofs, the Clerk session as the caller and Decane as legacy", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    const [url, init] = mocks.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:8094/clerk/link");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${CLERK}`);
    expect(headers["x-legacy-authorization"]).toBe(`Bearer ${DECANE}`);
    expect(init.method).toBe("POST");
  });

  it("reads the Decane token from the bridge cookie when there is no header", async () => {
    const response = await POST(request({ cookie: `decane-token=${DECANE}` }));
    // verifyRequest is mocked, so the route trusts it; the token it forwards is the cookie's.
    expect(response.status).toBe(200);
    const init = mocks.fetch.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-legacy-authorization"]).toBe(
      `Bearer ${DECANE}`
    );
  });

  it("refuses without a Decane session, and never calls the service", async () => {
    mocks.verifyRequest.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses a session that is not a Decane one", async () => {
    mocks.verifyRequest.mockResolvedValue({ provider: "privy", userId: "did:privy:x" });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses without a Clerk session, or when Clerk gives no token", async () => {
    mocks.auth.mockResolvedValue({ userId: null, getToken: async () => null });
    expect((await POST(request())).status).toBe(401);
    mocks.auth.mockResolvedValue({ userId: "user_1", getToken: async () => null });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("is off unless the upgrade is switched on", async () => {
    env({ NEXT_PUBLIC_WALLET_UPGRADE_ENABLED: "false" });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses a development deployment pointed at the production gateway", async () => {
    env({ MIGRATION_API_URL: "https://api.tsionark.com/v1/user-management" });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "NOT_AVAILABLE"
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("allows production upstream in development only when explicitly allowed", async () => {
    env({
      MIGRATION_API_URL: "https://api.tsionark.com/v1/user-management",
      WALLET_UPGRADE_ALLOW_PROD_UPSTREAM: "true",
    });
    expect((await POST(request())).status).toBe(200);
  });

  it("refuses production running on Clerk development keys", async () => {
    env({ NEXT_PUBLIC_DEPLOY_ENV: "production", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc" });
    expect((await POST(request())).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("answers 503 NOT_CONFIGURED when the migration service is switched off", async () => {
    env({ MIGRATION_SERVICE_ENABLED: "0" });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "NOT_CONFIGURED"
    );
  });

  it("reports an unreachable service as a 502 in the same envelope", async () => {
    mocks.fetch.mockRejectedValue(new Error("connect ECONNREFUSED"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(((await response.json()) as { success: boolean }).success).toBe(false);
  });
});
