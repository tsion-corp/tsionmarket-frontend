import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceClient } from "@/lib/api/service";

// apiFetch pulls a Privy token. What matters here is not WHICH transport is
// used but WHAT is sent: an authed read carries credentials, a public read
// carries none, because a response to a request bearing an Authorization
// header can never be stored by a shared cache. Both now go through the one
// transport so the circuit breaker sees them; `anonymous` is what keeps the
// public ones credential-free.
vi.mock("@/lib/api", () => ({
  // An anonymous read is passed through to the stubbed global fetch, so the
  // envelope, query-string and error cases below still exercise a real
  // response. An authed read returns a marker instead, which is how those
  // cases assert it never reached the network with credentials attached.
  apiFetch: vi.fn((path: string, init?: RequestInit, opts?: { anonymous?: boolean }) =>
    opts?.anonymous
      ? fetch(path, init)
      : Promise.resolve(
          new Response(JSON.stringify({ success: true, data: { via: "apiFetch", path, init } }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
  ),
}));

const { apiFetch } = await import("@/lib/api");

function jsonOk(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("createServiceClient", () => {
  const client = createServiceClient("/api/demo", "Demo is unavailable right now.");
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn(() => Promise.resolve(jsonOk({ ok: true })));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("prefixes the base path and unwraps the envelope", async () => {
    await expect(client.get("/thing")).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith("/api/demo/thing", {});
  });

  it("drops undefined query values instead of sending the string undefined", async () => {
    await client.get("/list", { page: 2, status: undefined, live: true });
    expect(fetchSpy).toHaveBeenCalledWith("/api/demo/list?page=2&live=true", {});
  });

  it("omits the query string entirely when nothing survives", async () => {
    await client.get("/list", { status: undefined });
    expect(fetchSpy).toHaveBeenCalledWith("/api/demo/list", {});
  });

  it("sends no credentials on a public read, so it stays cacheable", async () => {
    await client.get("/public");
    expect(apiFetch).toHaveBeenCalledWith("/api/demo/public", {}, { anonymous: true });
  });

  it("routes an authed read through apiFetch with requireAuth", async () => {
    await client.authedGet("/mine", { limit: 5 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledWith("/api/demo/mine?limit=5", {}, { requireAuth: true });
    // And the public path must NOT be given credentials.
    expect(apiFetch).not.toHaveBeenCalledWith("/api/demo/mine?limit=5", {}, { anonymous: true });
  });

  it("sends a JSON content-type only when there is a body", async () => {
    await client.post("/act", { amount: "1" });
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/demo/act",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: "1" }),
      },
      { requireAuth: true }
    );

    await client.post("/resign");
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/demo/resign",
      { method: "POST" },
      { requireAuth: true }
    );
  });

  it("carries the method through for put and delete", async () => {
    await client.put("/note", { text: "hi" });
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/demo/note",
      expect.objectContaining({ method: "PUT" }),
      { requireAuth: true }
    );

    await client.del("/note", { id: 1 });
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/api/demo/note",
      expect.objectContaining({ method: "DELETE" }),
      { requireAuth: true }
    );
  });

  it("throws the service's own error code, not the fallback sentence", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "NOT_CONFIGURED", message: "Vault isn't configured" },
        }),
        { status: 503, headers: { "content-type": "application/json" } }
      )
    );

    await expect(client.get("/game/status")).rejects.toMatchObject({
      code: "NOT_CONFIGURED",
      message: "Vault isn't configured",
      status: 503,
    });
  });

  it("falls back to the service's sentence when the body says nothing", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(client.get("/game/status")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "Demo is unavailable right now.",
    });
  });
});
