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

  it("backs off briefly when the identity token is not ready", async () => {
    const getAccessToken = vi.fn().mockResolvedValue("access-1");
    const getIdentityToken = vi.fn().mockResolvedValue(null);
    const c = clock(1000);
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: c.now });

    await resolve();
    c.advance(0.5);
    await resolve();

    expect(getIdentityToken).toHaveBeenCalledTimes(1);

    c.advance(0.5);
    await resolve();
    expect(getIdentityToken).toHaveBeenCalledTimes(2);
  });

  it("recovers when the identity token becomes available after startup", async () => {
    const identityToken = jwt({ exp: 5000 });
    const getAccessToken = vi.fn().mockResolvedValue("access-1");
    const getIdentityToken = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(identityToken);
    const c = clock(1000);
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: c.now });

    expect(await resolve()).toEqual({ accessToken: "access-1", idToken: null });

    c.advance(1);

    expect(await resolve()).toEqual({ accessToken: "access-1", idToken: identityToken });
    expect(getIdentityToken).toHaveBeenCalledTimes(2);
  });

  // The SDK re-issues the identity token itself on login, page load, account
  // link and every access-token refresh, and exposes it through
  // useIdentityToken with no network call. getIdentityToken(), by contrast,
  // always GETs /users/me first. Reading what the SDK holds keeps /users/me off
  // the hot path entirely.
  it("uses the identity token the SDK already holds without calling Privy", async () => {
    const held = jwt({ exp: 5000 });
    const getAccessToken = vi.fn().mockResolvedValue("access-1");
    const getIdentityToken = vi.fn().mockResolvedValue(jwt({ exp: 5000 }));
    const resolve = createTokenResolver({
      getAccessToken,
      getIdentityToken,
      peekIdentityToken: () => held,
      now: clock(1000).now,
    });

    expect(await resolve()).toEqual({ accessToken: "access-1", idToken: held });
    await resolve();
    expect(getIdentityToken).not.toHaveBeenCalled();
  });

  it("falls back to Privy when the held token is about to expire", async () => {
    const c = clock(1000);
    const getAccessToken = vi.fn().mockResolvedValue("access-1");
    const fresh = jwt({ exp: 9000 });
    const getIdentityToken = vi.fn().mockResolvedValue(fresh);
    const resolve = createTokenResolver({
      getAccessToken,
      getIdentityToken,
      // Inside the 60s refresh skew.
      peekIdentityToken: () => jwt({ exp: 1030 }),
      now: c.now,
    });

    expect((await resolve()).idToken).toBe(fresh);
    expect(getIdentityToken).toHaveBeenCalledTimes(1);
  });

  // A failed refresh used to leave nothing behind: the next caller, and every
  // poller and query retry after it, called Privy again at once. Under a 429
  // that is a loop that keeps the limit tripped.
  it("backs off after a failed refresh instead of retrying on the next request", async () => {
    const c = clock(1000);
    const getAccessToken = vi.fn().mockResolvedValue("access-1");
    const getIdentityToken = vi.fn().mockRejectedValue(new Error("Request failed with status 500"));
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: c.now });

    expect(await resolve()).toEqual({ accessToken: "access-1", idToken: null });
    await resolve();
    await resolve();
    expect(getIdentityToken).toHaveBeenCalledTimes(1);

    c.advance(1); // first retry after 1s
    await resolve();
    expect(getIdentityToken).toHaveBeenCalledTimes(2);

    c.advance(1); // second failure waits 2s, so nothing yet
    await resolve();
    expect(getIdentityToken).toHaveBeenCalledTimes(2);
    c.advance(1);
    await resolve();
    expect(getIdentityToken).toHaveBeenCalledTimes(3);
  });

  it("waits a full minute after a rate limit before asking again", async () => {
    const c = clock(1000);
    const getAccessToken = vi.fn().mockResolvedValue("access-1");
    const getIdentityToken = vi
      .fn()
      .mockRejectedValue(new Error("Request failed with status 429: Too Many Requests"));
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: c.now });

    await resolve();
    c.advance(59);
    await resolve();
    expect(getIdentityToken).toHaveBeenCalledTimes(1);
    c.advance(1);
    await resolve();
    expect(getIdentityToken).toHaveBeenCalledTimes(2);
  });

  it("keeps serving an unexpired token while a refresh is failing", async () => {
    const c = clock(1000);
    const token = jwt({ exp: 9000 });
    const getAccessToken = vi.fn().mockResolvedValueOnce("access-1").mockResolvedValue("access-2");
    const getIdentityToken = vi
      .fn()
      .mockResolvedValueOnce(token)
      .mockRejectedValue(new Error("Request failed with status 429"));
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: c.now });

    expect((await resolve()).idToken).toBe(token);
    // The access token rotated, the refresh fails: the still-valid token is
    // better than none, and far better than another /users/me.
    expect(await resolve()).toEqual({ accessToken: "access-2", idToken: token });
    expect(getIdentityToken).toHaveBeenCalledTimes(2);
  });

  // Audit finding: the SDK can move its store straight from user A's token to
  // user B's, or B can sign in before the bridge has cleared A. A held token
  // is only attached when it names the same user as the access token.
  it("never attaches an identity token that names a different user", async () => {
    const accessB = jwt({ sub: "did:privy:B", exp: 9000 });
    const identityA = jwt({ sub: "did:privy:A", exp: 9000 });
    const identityB = jwt({ sub: "did:privy:B", exp: 9000 });
    const getAccessToken = vi.fn().mockResolvedValue(accessB);
    const getIdentityToken = vi.fn().mockResolvedValue(identityB);
    const resolve = createTokenResolver({
      getAccessToken,
      getIdentityToken,
      peekIdentityToken: () => identityA,
      now: clock(1000).now,
    });

    expect(await resolve()).toEqual({ accessToken: accessB, idToken: identityB });
    expect(getIdentityToken).toHaveBeenCalledTimes(1);
  });

  // Audit finding: a rate limit's back-off outliving the session would make a
  // different user, signing in within the minute, wait it out for nothing.
  it("forgets the back-off when the session ends", async () => {
    const c = clock(1000);
    const getAccessToken = vi
      .fn()
      .mockResolvedValueOnce("access-1")
      .mockResolvedValueOnce(null)
      .mockResolvedValue("access-2");
    const getIdentityToken = vi
      .fn()
      .mockRejectedValueOnce(new Error("Request failed with status 429"))
      .mockResolvedValue(jwt({ exp: 9000 }));
    const resolve = createTokenResolver({ getAccessToken, getIdentityToken, now: c.now });

    await resolve(); // 429, back-off armed
    await resolve(); // signed out
    c.advance(1);
    expect((await resolve()).idToken).toBe(jwt({ exp: 9000 })); // new session, asks at once
    expect(getIdentityToken).toHaveBeenCalledTimes(2);
  });
});
