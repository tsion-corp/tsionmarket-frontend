import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  verifyPrivyAccessToken: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => auth);

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return {
    nextUrl: new URL("https://app.test/api/migration/x"),
    headers: new Headers(headers),
    cookies: { get: vi.fn(() => undefined) },
    text: async () => "",
  } as unknown as NextRequest;
}

async function loadRoutes(enabled: boolean) {
  vi.resetModules();
  process.env.MIGRATION_API_URL = "http://migration.test";
  if (enabled) process.env.MIGRATION_SERVICE_ENABLED = "1";
  else delete process.env.MIGRATION_SERVICE_ENABLED;
  const link = await import("@/app/api/migration/link/route");
  const status = await import("@/app/api/migration/status/route");
  return { link, status };
}

function upstream(status: number, body: unknown) {
  global.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })
  ) as unknown as typeof fetch;
}

const CLAIMS = { userId: "u", sessionId: "s", issuedAt: 0, expiration: 0 };

describe("migration routes", () => {
  beforeEach(() => {
    auth.verifyRequest.mockReset();
    auth.verifyPrivyAccessToken.mockReset();
    upstream(200, { success: true, data: { linked: true } });
  });

  it("answers status with the empty shape while the service is off", async () => {
    auth.verifyRequest.mockResolvedValue(CLAIMS);
    const { status } = await loadRoutes(false);
    const res = await status.GET(makeReq({ authorization: "Bearer d" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: {
        linked: null, // "could not say", not "no" — see the route's EMPTY_STATUS
        legacy: null,
        hasLegacyFunds: false,
        legacyFundsUsd: 0,
        pendingOnramps: [],
        rekey: {},
      },
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("still requires a session for status", async () => {
    auth.verifyRequest.mockResolvedValue(null);
    const { status } = await loadRoutes(false);
    expect((await status.GET(makeReq())).status).toBe(401);
  });

  it("forwards status with the bearer and maps an unknown account to the empty shape", async () => {
    auth.verifyRequest.mockResolvedValue(CLAIMS);
    const { status } = await loadRoutes(true);
    const ok = await status.GET(makeReq({ authorization: "Bearer d" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ success: true, data: { linked: true } });
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://migration.test/status");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer d" });

    upstream(404, { success: false, error: { code: "NOT_FOUND" } });
    const unknown = await status.GET(makeReq({ authorization: "Bearer d" }));
    expect(unknown.status).toBe(200);
    expect((await unknown.json()).data.linked).toBe(null);
  });

  it("refuses to link while the service is off", async () => {
    const { link } = await loadRoutes(false);
    const res = await link.POST(makeReq({ authorization: "Bearer d" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("NOT_CONFIGURED");
    expect(auth.verifyRequest).not.toHaveBeenCalled();
  });

  it("requires both a current session and a verified legacy token to link", async () => {
    const { link } = await loadRoutes(true);

    auth.verifyRequest.mockResolvedValue(null);
    expect((await link.POST(makeReq({ authorization: "Bearer d" }))).status).toBe(401);

    auth.verifyRequest.mockResolvedValue(CLAIMS);
    auth.verifyPrivyAccessToken.mockResolvedValue(null);
    expect(
      (
        await link.POST(
          makeReq({ authorization: "Bearer d", "x-legacy-authorization": "Bearer p" })
        )
      ).status
    ).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("forwards both tokens to the service on a valid link", async () => {
    auth.verifyRequest.mockResolvedValue(CLAIMS);
    auth.verifyPrivyAccessToken.mockResolvedValue(CLAIMS);
    const { link } = await loadRoutes(true);
    const res = await link.POST(
      makeReq({
        authorization: "Bearer d",
        "x-legacy-authorization": "Bearer p",
        "privy-id-token": "id",
      })
    );
    expect(res.status).toBe(200);
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://migration.test/link");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer d",
      "x-legacy-authorization": "Bearer p",
      "privy-id-token": "id",
    });
  });

  it("reports an unreachable service as a 502 envelope", async () => {
    auth.verifyRequest.mockResolvedValue(CLAIMS);
    global.fetch = vi.fn(async () => {
      throw new Error("down");
    }) as unknown as typeof fetch;
    const { status } = await loadRoutes(true);
    const res = await status.GET(makeReq({ authorization: "Bearer d" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe("UPSTREAM_ERROR");
  });
});
