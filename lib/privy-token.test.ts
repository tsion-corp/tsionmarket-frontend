import { describe, expect, it, vi } from "vitest";
import { createTokenResolver, decodeJwtExp } from "@/lib/privy-token";

// Builds a JWT-shaped string whose payload carries the given claims. Only the
// middle segment matters to decodeJwtExp; the header and signature are filler.
function jwt(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${payload}.sig`;
}

describe("decodeJwtExp", () => {
  it("reads a numeric exp claim", () => {
    expect(decodeJwtExp(jwt({ exp: 1893456000 }))).toBe(1893456000);
  });

  it("returns null for a token without exp", () => {
    expect(decodeJwtExp(jwt({ sub: "user" }))).toBeNull();
  });

  it("returns null for a non-numeric exp", () => {
    expect(decodeJwtExp(jwt({ exp: "soon" }))).toBeNull();
  });

  it("returns null for a malformed token", () => {
    expect(decodeJwtExp("not-a-jwt")).toBeNull();
    expect(decodeJwtExp("only.two")).toBeNull();
    expect(decodeJwtExp("a.!!!.c")).toBeNull();
  });
});

describe("createTokenResolver caching", () => {
  // A fixed clock the tests advance by hand.
  function clock(start = 1000) {
    let t = start;
    return { now: () => t, advance: (secs: number) => (t += secs) };
  }

  it("fetches both tokens on the first call", async () => {
    const getAccessToken = vi.fn().mockResolvedValue("access-1");
    const getIdentityToken = vi.fn().mockResolvedValue(jwt({ exp: 5000 }));
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: clock().now });

    const tokens = await resolve();

    expect(tokens).toEqual({ accessToken: "access-1", idToken: jwt({ exp: 5000 }) });
    expect(getIdentityToken).toHaveBeenCalledTimes(1);
  });

  it("reuses the cached identity token within its lifetime", async () => {
    const getAccessToken = vi.fn().mockResolvedValue("access-1");
    const getIdentityToken = vi.fn().mockResolvedValue(jwt({ exp: 5000 }));
    const c = clock(1000);
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: c.now });

    await resolve();
    c.advance(1000); // still well before exp 5000
    await resolve();
    await resolve();

    // The access token is read each call (it is cheap), but the identity token
    // is fetched only once.
    expect(getIdentityToken).toHaveBeenCalledTimes(1);
    expect(getAccessToken).toHaveBeenCalledTimes(3);
  });

  it("refreshes the identity token once it nears expiry", async () => {
    const getAccessToken = vi.fn().mockResolvedValue("access-1");
    const getIdentityToken = vi.fn().mockResolvedValue(jwt({ exp: 5000 }));
    const c = clock(1000);
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: c.now });

    await resolve();
    // Move to within the 60s refresh skew of exp 5000.
    c.advance(3950); // now 4950, exp - skew = 4940, so 4950 > 4940 -> refresh
    await resolve();

    expect(getIdentityToken).toHaveBeenCalledTimes(2);
  });

  it("refreshes when the access token rotates", async () => {
    const getAccessToken = vi.fn().mockResolvedValueOnce("access-1").mockResolvedValue("access-2");
    const getIdentityToken = vi.fn().mockResolvedValue(jwt({ exp: 9000 }));
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: clock().now });

    const first = await resolve();
    const second = await resolve();

    expect(first.accessToken).toBe("access-1");
    expect(second.accessToken).toBe("access-2");
    // A new access token means a new session, so the identity token is refetched.
    expect(getIdentityToken).toHaveBeenCalledTimes(2);
  });

  it("collapses a burst of concurrent calls into one identity fetch", async () => {
    const getAccessToken = vi.fn().mockResolvedValue("access-1");
    let resolveId: (t: string) => void = () => {};
    const idPromise = new Promise<string>((r) => (resolveId = r));
    const getIdentityToken = vi.fn().mockReturnValue(idPromise);
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: clock().now });

    // Fire ten resolves before the identity fetch settles.
    const all = Promise.all(Array.from({ length: 10 }, () => resolve()));
    resolveId(jwt({ exp: 5000 }));
    const results = await all;

    expect(getIdentityToken).toHaveBeenCalledTimes(1);
    for (const r of results) {
      expect(r.idToken).toBe(jwt({ exp: 5000 }));
    }
  });

  it("returns nulls and clears the cache when signed out", async () => {
    const getAccessToken = vi.fn().mockResolvedValueOnce("access-1").mockResolvedValue(null);
    const getIdentityToken = vi.fn().mockResolvedValue(jwt({ exp: 9000 }));
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: clock().now });

    await resolve(); // signed in, caches
    const out = await resolve(); // now signed out

    expect(out).toEqual({ accessToken: null, idToken: null });
    // No extra identity fetch while signed out.
    expect(getIdentityToken).toHaveBeenCalledTimes(1);
  });

  it("does not hammer when there is no identity token", async () => {
    const getAccessToken = vi.fn().mockResolvedValue("access-1");
    const getIdentityToken = vi.fn().mockResolvedValue(null);
    const c = clock(1000);
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: c.now });

    await resolve();
    c.advance(100); // within the 300s fallback TTL
    await resolve();

    expect(getIdentityToken).toHaveBeenCalledTimes(1);

    c.advance(300); // past the fallback TTL -> one more attempt
    await resolve();
    expect(getIdentityToken).toHaveBeenCalledTimes(2);
  });
});
