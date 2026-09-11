import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The proxy is the only gate in front of the engine, and every wallet-scoped
// read went upstream on every request. A second tab, a double mount, or two
// cards on one page each cost the engine a call for the same wallet within
// the same second. A short cache keyed by the exact URL collapses them; a
// write for the wallet drops its entries so the refresh after an action sees
// the engine, not the cache.

const { verifyRequest, getRequestUser, fetch } = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  getRequestUser: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ verifyRequest, getRequestUser }));
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
    const res = await route.GET(get(path), ctx(path));
    expect(res.status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
