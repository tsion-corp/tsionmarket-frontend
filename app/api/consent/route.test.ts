import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { verifyRequest, getRequestUser, setCustomMetadata, fetch } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  getRequestUser: vi.fn(),
  setCustomMetadata: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ verifyRequest, getRequestUser }));
vi.mock("@/lib/server/privy", () => ({
  getPrivyClient: () => ({ users: () => ({ setCustomMetadata }) }),
}));

function req(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: new Headers(),
    cookies: { get: () => undefined },
  } as unknown as NextRequest;
}

const USER = {
  id: "did:privy:abc",
  custom_metadata: { existing: "kept" },
  linked_accounts: [
    { type: "passkey" },
    { type: "email", address: "Person@Example.com" },
    { type: "google_oauth", email: "g@example.com" },
  ],
};

const BODY = {
  terms: true,
  termsVersion: "2026-09-10",
  acceptedAt: "2026-09-10T12:00:00.000Z",
  marketing: true,
};

describe("POST /api/consent", () => {
  beforeEach(() => {
    verifyRequest.mockResolvedValue({ userId: USER.id });
    getRequestUser.mockResolvedValue(USER);
    setCustomMetadata.mockResolvedValue(USER);
    fetch.mockResolvedValue(new Response(JSON.stringify({ success: true, data: {} })));
    vi.stubGlobal("fetch", fetch);
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("records the answers on the account, keeping what was there, and subscribes the sign in email", async () => {
    const { POST } = await import("./route");
    const res = await POST(req(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      termsVersion: "2026-09-10",
      termsAcceptedAt: "2026-09-10T12:00:00.000Z",
      marketing: true,
      subscribed: true,
    });
    expect(setCustomMetadata).toHaveBeenCalledWith(USER.id, {
      custom_metadata: expect.objectContaining({
        existing: "kept",
        terms_version: "2026-09-10",
        terms_accepted_at: "2026-09-10T12:00:00.000Z",
        marketing_opt_in: true,
      }),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      email: "person@example.com",
      source: "auth-optin",
    });
  });

  it("records a no to marketing without touching the subscriber list", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ ...BODY, marketing: false }));
    expect(res.status).toBe(200);
    expect(setCustomMetadata).toHaveBeenCalledWith(USER.id, {
      custom_metadata: expect.objectContaining({ marketing_opt_in: false }),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records a yes on an account with no email and subscribes nobody", async () => {
    getRequestUser.mockResolvedValue({ ...USER, linked_accounts: [{ type: "passkey" }] });
    const { POST } = await import("./route");
    const res = await POST(req(BODY));
    expect((await res.json()).subscribed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session before touching anything", async () => {
    verifyRequest.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    expect((await POST(req(BODY))).status).toBe(401);
    expect(setCustomMetadata).not.toHaveBeenCalled();
  });

  it("refuses a record that does not accept the terms, or is malformed", async () => {
    const { POST } = await import("./route");
    expect((await POST(req({ ...BODY, terms: false }))).status).toBe(400);
    expect((await POST(req({ ...BODY, termsVersion: "v1" }))).status).toBe(400);
    expect((await POST(req({ ...BODY, acceptedAt: "yesterday" }))).status).toBe(400);
    expect((await POST(req({ ...BODY, marketing: "yes" }))).status).toBe(400);
    expect((await POST(req(null))).status).toBe(400);
    expect(setCustomMetadata).not.toHaveBeenCalled();
  });

  it("answers 502 when the account store cannot be written, and subscribes nobody", async () => {
    setCustomMetadata.mockRejectedValueOnce(new Error("privy down"));
    const { POST } = await import("./route");
    expect((await POST(req(BODY))).status).toBe(502);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still answers ok when the subscriber list is down: the account is the truth", async () => {
    fetch.mockRejectedValueOnce(new Error("list down"));
    const { POST } = await import("./route");
    const res = await POST(req(BODY));
    expect(res.status).toBe(200);
    expect((await res.json()).subscribed).toBe(true);
  });
});

describe("GET /api/consent", () => {
  beforeEach(() => {
    verifyRequest.mockResolvedValue({ userId: USER.id });
  });
  afterEach(() => vi.clearAllMocks());

  it("reads the record back from the account", async () => {
    getRequestUser.mockResolvedValue({
      ...USER,
      custom_metadata: {
        terms_version: "2026-09-10",
        terms_accepted_at: "2026-09-10T12:00:00.000Z",
        marketing_opt_in: true,
      },
    });
    const { GET } = await import("./route");
    const res = await GET(req(null));
    expect(await res.json()).toEqual({
      termsVersion: "2026-09-10",
      termsAcceptedAt: "2026-09-10T12:00:00.000Z",
      marketing: true,
    });
  });

  it("answers nulls for an account with no record", async () => {
    getRequestUser.mockResolvedValue({ ...USER, custom_metadata: undefined });
    const { GET } = await import("./route");
    expect(await (await GET(req(null))).json()).toEqual({
      termsVersion: null,
      termsAcceptedAt: null,
      marketing: false,
    });
  });
});
