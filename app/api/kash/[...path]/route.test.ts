import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The proxy is the only gate in front of the engine, and every wallet-scoped
// read went upstream on every request. A second tab, a double mount, or two
// cards on one page each cost the engine a call for the same wallet within
// the same second. A short cache keyed by the exact URL collapses them; a
// write for the wallet drops its entries so the refresh after an action sees
// the engine, not the cache.

const { verifyRequest, getRequestUser, getRequestIdentity, fetch } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  getRequestUser: vi.fn(),
  getRequestIdentity: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ verifyRequest, getRequestUser, getRequestIdentity }));
vi.mock("@/lib/server/chess-identity", () => ({
  walletOfUser: (user: { wallet?: string } | null) => user?.wallet ?? null,
}));

const WALLET = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

function answer(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function get(path: string) {
  return new NextRequest(`http://app.test/api/kash/${path}`, {
    headers: { authorization: "Bearer t" },
  });
}
function post(path: string, body: unknown) {
  return new NextRequest(`http://app.test/api/kash/${path}`, {
    method: "POST",
    headers: { authorization: "Bearer t", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = (path: string) => ({ params: Promise.resolve({ path: path.split("/") }) });

let route: typeof import("./route");

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("KASH_API_URL", "http://kash.test");
  vi.stubGlobal("fetch", fetch);
  fetch.mockReset();
  fetch.mockImplementation(async () => answer({ success: true, data: { balance: "1" } }));
  verifyRequest.mockResolvedValue({ userId: "did:x" });
  getRequestUser.mockResolvedValue({ wallet: WALLET });
  getRequestIdentity.mockResolvedValue({
    userId: "did:x",
    evmAddress: WALLET,
    solanaAddress: null,
  });
  route = await import("./route");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("wallet-scoped reads", () => {
  it("serves a repeat read of the same wallet from the cache for a moment", async () => {
    const path = `accounts/${WALLET}`;
    const first = await route.GET(get(path), ctx(path));
    expect(first.status).toBe(200);
    await route.GET(get(path), ctx(path));
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2_500);
    await route.GET(get(path), ctx(path));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("collapses reads that are in flight together into one upstream call", async () => {
    const path = `accounts/${WALLET}`;
    let release: (r: Response) => void = () => {};
    const upstream = new Promise<Response>((resolve) => {
      release = resolve;
    });
    fetch.mockImplementationOnce(() => upstream);
    const a = route.GET(get(path), ctx(path));
    const b = route.GET(get(path), ctx(path));
    // Both requests pass the session gate and reach the upstream call.
    await vi.advanceTimersByTimeAsync(10);
    expect(fetch).toHaveBeenCalledTimes(1);
    release(answer({ success: true, data: { balance: "2" } }));
    const [ra, rb] = await Promise.all([a, b]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await ra.json()).toEqual(await rb.json());
  });

  it("drops the wallet's cached reads when it writes", async () => {
    const path = `accounts/${WALLET}`;
    await route.GET(get(path), ctx(path));
    await route.POST(post("purchases", { wallet: WALLET, usdcAmount: "5" }), ctx("purchases"));
    await route.GET(get(path), ctx(path));
    // Read, write, read again: three upstream calls, the last not from cache.
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("never lets another session read a cached wallet", async () => {
    const path = `accounts/${WALLET}`;
    await route.GET(get(path), ctx(path));
    getRequestUser.mockResolvedValue({ wallet: OTHER });
    getRequestIdentity.mockResolvedValue({
      userId: "did:x",
      evmAddress: OTHER,
      solanaAddress: null,
    });
    const res = await route.GET(get(path), ctx(path));
    expect(res.status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

/**
 * The network reads are scoped upstream by the verified Privy token, exactly
 * as /referrals/me is. What the proxy owes them is narrow and easy to get
 * wrong: require a session, forward the token, and do not forward it anywhere
 * else.
 */
describe("the caller's own referral network", () => {
  const withIdentity = (path: string) =>
    new NextRequest(`http://app.test/api/kash/${path}`, {
      headers: { authorization: "Bearer t", "privy-id-token": "privy-token" },
    });

  it.each(["referrals/me/network", "referrals/me/downline?generation=1"])(
    "forwards %s with the caller's identity token",
    async (path) => {
      const res = await route.GET(withIdentity(path), ctx(path.split("?")[0]));
      expect(res.status).toBe(200);
      const [url, init] = fetch.mock.calls[0];
      expect(String(url)).toContain(path.split("?")[0]);
      expect(new Headers(init.headers).get("privy-id-token")).toBe("privy-token");
    }
  );

  it("carries the generation and cursor upstream", async () => {
    const path = "referrals/me/downline";
    const req = new NextRequest(`http://app.test/api/kash/${path}?generation=2&cursor=42`, {
      headers: { authorization: "Bearer t", "privy-id-token": "privy-token" },
    });
    await route.GET(req, ctx(path));
    expect(String(fetch.mock.calls[0][0])).toContain("generation=2&cursor=42");
  });

  // A verified session is the requirement, not a Privy identity token: Decane
  // issues none, and its bearer is what the engine resolves the wallet from.
  it.each(["referrals/me/network", "referrals/me/downline"])(
    "forwards %s on a session without an identity token, sending none upstream",
    async (path) => {
      const res = await route.GET(get(path), ctx(path));
      expect(res.status).toBe(200);
      const [, init] = fetch.mock.calls[0];
      expect(new Headers(init.headers).get("privy-id-token")).toBeNull();
      expect(new Headers(init.headers).get("authorization")).toBe("Bearer t");
    }
  );

  it.each(["referrals/me/network", "referrals/me/downline"])(
    "refuses %s without a session",
    async (path) => {
      verifyRequest.mockResolvedValue(null);
      const res = await route.GET(withIdentity(path), ctx(path));
      expect(res.status).toBe(401);
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  // The token is the caller's identity; it belongs only on the routes the
  // engine verifies it on.
  it("does not forward the identity token to an unrelated read", async () => {
    const path = `accounts/${WALLET}`;
    await route.GET(withIdentity(path), ctx(path));
    const [, init] = fetch.mock.calls[0];
    expect(new Headers(init.headers).get("privy-id-token")).toBeNull();
  });
});
