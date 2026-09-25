import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const {
  verifyRequest,
  getRequestUser,
  setCustomMetadata,
  readDecanePreferences,
  updateDecanePreferences,
} = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  getRequestUser: vi.fn(),
  setCustomMetadata: vi.fn(),
  readDecanePreferences: vi.fn(),
  updateDecanePreferences: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({
  verifyRequest,
  getRequestUser,
  extractAccessToken: () => "decane-jwt",
}));
vi.mock("@/lib/server/decane", () => ({
  readDecanePreferences,
  updateDecanePreferences,
  DecanePreferencesError: class extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message);
    }
  },
}));
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

// The account this route writes to already carries a consent record. Every
// write here has to leave it exactly as it found it.
const USER = {
  id: "did:privy:abc",
  custom_metadata: {
    terms_version: "2026-09-10",
    marketing_opt_in: true,
  },
  linked_accounts: [{ type: "passkey" }],
};

const ALL_ON = {
  memecoin: true,
  spot: true,
  rwa: true,
  prediction: true,
  perps: true,
  arcade: true,
  sports: true,
};

describe("GET /api/preferences", () => {
  beforeEach(() => {
    verifyRequest.mockResolvedValue({ userId: USER.id });
    getRequestUser.mockResolvedValue(USER);
  });
  afterEach(() => vi.clearAllMocks());

  // The default is ON, so an account that has never touched Shine must read
  // as on everywhere. Reading an absent key as off would silently stop
  // posting for everyone who never opted out.
  it("reads an absent key as on, because the default is on", async () => {
    getRequestUser.mockResolvedValue({ ...USER, custom_metadata: {} });
    const { GET } = await import("./route");
    const res = await GET(req(null));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shine: ALL_ON });
  });

  it("reads an account with no metadata at all as on everywhere", async () => {
    getRequestUser.mockResolvedValue({ ...USER, custom_metadata: undefined });
    const { GET } = await import("./route");
    expect(await (await GET(req(null))).json()).toEqual({ shine: ALL_ON });
  });

  // An explicit false is the only thing that means off. This is the
  // difference between "never touched it" and "turned it off".
  it("reads an explicit false as off, per service, leaving the others on", async () => {
    getRequestUser.mockResolvedValue({
      ...USER,
      custom_metadata: { shine_perps: false, shine_memecoin: true },
    });
    const { GET } = await import("./route");
    expect(await (await GET(req(null))).json()).toEqual({
      shine: { ...ALL_ON, perps: false },
    });
  });

  // Anything that is not a boolean is not a decision anyone made here, so it
  // falls back to the product default rather than being coerced.
  it("reads a value that is not a boolean as the default", async () => {
    getRequestUser.mockResolvedValue({
      ...USER,
      custom_metadata: { shine_spot: "false", shine_rwa: 0, shine_arcade: null },
    });
    const { GET } = await import("./route");
    expect(await (await GET(req(null))).json()).toEqual({ shine: ALL_ON });
  });

  it("refuses a caller with no session", async () => {
    verifyRequest.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    expect((await GET(req(null))).status).toBe(401);
  });

  it("refuses when the account cannot be resolved", async () => {
    getRequestUser.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    expect((await GET(req(null))).status).toBe(401);
  });
});

describe("POST /api/preferences", () => {
  beforeEach(() => {
    verifyRequest.mockResolvedValue({ userId: USER.id });
    getRequestUser.mockResolvedValue(USER);
    setCustomMetadata.mockResolvedValue(USER);
  });
  afterEach(() => vi.clearAllMocks());

  it("writes one service and answers with the whole resolved record", async () => {
    const { POST } = await import("./route");
    const res = await POST(req({ shine: { perps: false } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shine: { ...ALL_ON, perps: false } });
  });

  // setCustomMetadata replaces the whole object. Without the merge-spread this
  // write wipes the account's consent record.
  it("keeps every unrelated key that was already on the account", async () => {
    const { POST } = await import("./route");
    await POST(req({ shine: { memecoin: false } }));
    expect(setCustomMetadata).toHaveBeenCalledWith(USER.id, {
      custom_metadata: {
        terms_version: "2026-09-10",
        marketing_opt_in: true,
        shine_memecoin: false,
      },
    });
  });

  it("keeps an earlier Shine key that this write does not name", async () => {
    getRequestUser.mockResolvedValue({
      ...USER,
      custom_metadata: { ...USER.custom_metadata, shine_sports: false },
    });
    const { POST } = await import("./route");
    const res = await POST(req({ shine: { arcade: false } }));
    expect(setCustomMetadata).toHaveBeenCalledWith(USER.id, {
      custom_metadata: expect.objectContaining({
        terms_version: "2026-09-10",
        shine_sports: false,
        shine_arcade: false,
      }),
    });
    expect(await res.json()).toEqual({
      shine: { ...ALL_ON, sports: false, arcade: false },
    });
  });

  it("writes every one of the seven services under its own key", async () => {
    const { POST } = await import("./route");
    await POST(
      req({
        shine: {
          memecoin: false,
          spot: false,
          rwa: false,
          prediction: false,
          perps: false,
          arcade: false,
          sports: false,
        },
      })
    );
    const [, payload] = setCustomMetadata.mock.calls[0] as [
      string,
      { custom_metadata: Record<string, unknown> },
    ];
    expect(payload.custom_metadata).toMatchObject({
      shine_memecoin: false,
      shine_spot: false,
      shine_rwa: false,
      shine_prediction: false,
      shine_perps: false,
      shine_arcade: false,
      shine_sports: false,
    });
  });

  it("turns a service back on by writing an explicit true", async () => {
    getRequestUser.mockResolvedValue({
      ...USER,
      custom_metadata: { ...USER.custom_metadata, shine_spot: false },
    });
    const { POST } = await import("./route");
    const res = await POST(req({ shine: { spot: true } }));
    expect(setCustomMetadata).toHaveBeenCalledWith(USER.id, {
      custom_metadata: expect.objectContaining({ shine_spot: true }),
    });
    expect(await res.json()).toEqual({ shine: ALL_ON });
  });

  // The route sets the keys itself from a validated body, so nothing a client
  // sends lands in the account's metadata verbatim.
  it("refuses a body it does not recognise, before touching the account", async () => {
    const { POST } = await import("./route");
    expect((await POST(req(null))).status).toBe(400);
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ shine: {} }))).status).toBe(400);
    expect((await POST(req({ shine: { casino: false } }))).status).toBe(400);
    expect((await POST(req({ shine: { perps: "off" } }))).status).toBe(400);
    expect((await POST(req({ shine: { perps: false }, terms_version: "hack" }))).status).toBe(400);
    expect((await POST(req({ shine: null }))).status).toBe(400);
    expect(setCustomMetadata).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session before touching anything", async () => {
    verifyRequest.mockResolvedValueOnce(null);
    const { POST } = await import("./route");
    expect((await POST(req({ shine: { perps: false } }))).status).toBe(401);
    expect(setCustomMetadata).not.toHaveBeenCalled();
  });

  it("answers 502 when the account store cannot be written", async () => {
    setCustomMetadata.mockRejectedValueOnce(new Error("privy down"));
    const { POST } = await import("./route");
    const res = await POST(req({ shine: { perps: false } }));
    expect(res.status).toBe(502);
    // Nothing is claimed to have been saved.
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });
});

// A Decane session has no Privy user. The same record, under the same keys,
// lives in the user's preferences record on Decane instead, and every call
// carries the caller's own token.
describe("/api/preferences on a Decane session", () => {
  beforeEach(() => {
    verifyRequest.mockResolvedValue({ provider: "decane", userId: "6f0e…" });
    getRequestUser.mockResolvedValue(null);
  });
  afterEach(() => vi.clearAllMocks());

  it("reads the record from Decane, absent keys on, explicit false off", async () => {
    readDecanePreferences.mockResolvedValue({ shine_perps: false, terms_version: "2026-09-10" });
    const { GET } = await import("./route");
    const res = await GET(req(null));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shine: { ...ALL_ON, perps: false } });
    expect(readDecanePreferences).toHaveBeenCalledWith("decane-jwt");
    expect(getRequestUser).not.toHaveBeenCalled();
  });

  it("reads an account that never wrote anything as on everywhere", async () => {
    readDecanePreferences.mockResolvedValue({});
    const { GET } = await import("./route");
    expect(await (await GET(req(null))).json()).toEqual({ shine: ALL_ON });
  });

  it("writes one service as a merge, and answers with what Decane now holds", async () => {
    updateDecanePreferences.mockResolvedValue({ shine_perps: false, shine_sports: false });
    const { POST } = await import("./route");
    const res = await POST(req({ shine: { perps: false } }));
    expect(res.status).toBe(200);
    expect(updateDecanePreferences).toHaveBeenCalledWith("decane-jwt", { shine_perps: false });
    expect(await res.json()).toEqual({ shine: { ...ALL_ON, perps: false, sports: false } });
    expect(setCustomMetadata).not.toHaveBeenCalled();
  });

  it("answers 401 for a token Decane has stopped accepting, 502 when Decane is down", async () => {
    const { DecanePreferencesError } = await import("@/lib/server/decane");
    readDecanePreferences.mockRejectedValueOnce(new DecanePreferencesError("revoked", 401));
    const { GET, POST } = await import("./route");
    expect((await GET(req(null))).status).toBe(401);
    updateDecanePreferences.mockRejectedValueOnce(new DecanePreferencesError("down", 0));
    expect((await POST(req({ shine: { rwa: false } }))).status).toBe(502);
  });

  it("still refuses a malformed body before calling Decane", async () => {
    const { POST } = await import("./route");
    expect((await POST(req({ shine: { deposits: false } }))).status).toBe(400);
    expect(updateDecanePreferences).not.toHaveBeenCalled();
  });
});
