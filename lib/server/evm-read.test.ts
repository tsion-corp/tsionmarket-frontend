import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The read pool for portfolio balances: ZeroDev first, Alchemy when ZeroDev
// cannot serve the chain or the method, with the failure remembered so the
// next read does not pay for the same answer. Verified against ZeroDev on
// 2026-09-07: four of our networks answer HTTP 400 "No API provider supports
// the requested chainId", others answer per-method "Method not found" or
// "not whitelisted" depending on where ZeroDev routes.

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const CALLS = [{ id: 1, method: "eth_getBalance", params: ["0xabc", "latest"] }];

function urlOf(call: unknown): string {
  const [input] = call as [RequestInfo | URL];
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

describe("readEvm provider order", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("ZERODEV_PROJECT_ID", "test-project-id-123");
    vi.stubEnv("ALCHEMY_API_KEY", "alchemy-key");
    vi.stubGlobal("fetch", vi.fn());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T12:00:00Z"));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("answers from ZeroDev and never touches Alchemy", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x10" }]));
    const { readEvm } = await import("./evm-read");

    const out = await readEvm("base-mainnet", 8453, CALLS);

    expect(out[0].result).toBe("0x10");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(urlOf(vi.mocked(fetch).mock.calls[0])).toContain("rpc.zerodev.app");
    expect(urlOf(vi.mocked(fetch).mock.calls[0])).toContain("/chain/8453");
  });

  it("falls through to Alchemy when ZeroDev has no provider for the chain, and skips ZeroDev next time", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json(400, { error: "No API provider supports the requested chainId." })
      )
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x20" }]))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x21" }]));
    const { readEvm } = await import("./evm-read");

    expect((await readEvm("zora-mainnet", 7777777, CALLS))[0].result).toBe("0x20");
    expect(urlOf(vi.mocked(fetch).mock.calls[1])).toBe(
      "https://zora-mainnet.g.alchemy.com/v2/alchemy-key"
    );

    expect((await readEvm("zora-mainnet", 7777777, CALLS))[0].result).toBe("0x21");
    // Second read: no ZeroDev attempt.
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(urlOf(vi.mocked(fetch).mock.calls[2])).toContain("g.alchemy.com");
  });

  it("treats a method ZeroDev's provider does not serve the same way", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        json(200, [{ jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } }])
      )
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x30" }]));
    const { readEvm } = await import("./evm-read");

    expect((await readEvm("monad-mainnet", 143, CALLS))[0].result).toBe("0x30");
    expect(urlOf(vi.mocked(fetch).mock.calls[1])).toContain("monad-mainnet.g.alchemy.com");
  });

  it("backs ZeroDev off for a minute after a 429 and asks again afterwards", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(429, { error: "rate limited" }))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x40" }]))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x41" }]))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x42" }]));
    const { readEvm } = await import("./evm-read");

    await readEvm("base-mainnet", 8453, CALLS);
    await readEvm("arb-mainnet", 42161, CALLS); // inside the minute: Alchemy directly
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(urlOf(vi.mocked(fetch).mock.calls[2])).toContain("arb-mainnet.g.alchemy.com");

    vi.setSystemTime(new Date("2026-09-07T12:01:01Z"));
    await readEvm("base-mainnet", 8453, CALLS);
    expect(urlOf(vi.mocked(fetch).mock.calls[3])).toContain("rpc.zerodev.app");
  });

  it("falls through once on a transport failure without remembering the chain", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x50" }]))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x51" }]));
    const { readEvm } = await import("./evm-read");

    expect((await readEvm("base-mainnet", 8453, CALLS))[0].result).toBe("0x50");
    vi.setSystemTime(new Date("2026-09-07T12:00:10Z"));
    await readEvm("base-mainnet", 8453, CALLS);
    expect(urlOf(vi.mocked(fetch).mock.calls[2])).toContain("rpc.zerodev.app");
  });

  it("returns envelopes in call order whatever order the provider used", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      json(200, [
        { jsonrpc: "2.0", id: 2, result: "0xb" },
        { jsonrpc: "2.0", id: 1, result: "0xa" },
      ])
    );
    const { readEvm } = await import("./evm-read");
    const out = await readEvm("base-mainnet", 8453, [
      { id: 1, method: "eth_getBalance", params: [] },
      { id: 2, method: "eth_call", params: [] },
    ]);
    expect(out.map((e) => e.result)).toEqual(["0xa", "0xb"]);
  });

  // Audit: a transient 5xx on one chain must not send every other chain to
  // Alchemy; that costs 46 CU per network for the rest of the refresh.
  it("falls through once on a 5xx for that chain only", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(502, { error: "bad gateway" }))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x60" }]))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x61" }]));
    const { readEvm } = await import("./evm-read");

    expect((await readEvm("base-mainnet", 8453, CALLS))[0].result).toBe("0x60");
    expect(urlOf(vi.mocked(fetch).mock.calls[1])).toContain("base-mainnet.g.alchemy.com");
    // Another chain, same instant: still ZeroDev.
    expect((await readEvm("arb-mainnet", 42161, CALLS))[0].result).toBe("0x61");
    expect(urlOf(vi.mocked(fetch).mock.calls[2])).toContain("rpc.zerodev.app");
  });

  // Audit: only ZeroDev's own "no provider" answer means the chain is
  // unserved. A 400 for a malformed request of ours must not park the chain.
  it("does not remember a 400 that is not ZeroDev's no-provider answer", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(400, { error: "invalid request body" }))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x70" }]))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x71" }]));
    const { readEvm } = await import("./evm-read");

    await readEvm("base-mainnet", 8453, CALLS);
    await readEvm("base-mainnet", 8453, CALLS);
    expect(urlOf(vi.mocked(fetch).mock.calls[2])).toContain("rpc.zerodev.app");
  });

  // Seen live on Mythos: ZeroDev answers 400 "Could not find chain" rather
  // than "No API provider". Same meaning, same treatment, or every refresh
  // asks ZeroDev again before going to Alchemy.
  it("remembers ZeroDev's 'could not find chain' answer like 'no provider'", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(400, { error: "Could not find chain with id 42018" }))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x80" }]))
      .mockResolvedValueOnce(json(200, [{ jsonrpc: "2.0", id: 1, result: "0x81" }]));
    const { readEvm } = await import("./evm-read");

    await readEvm("mythos-mainnet", 42018, CALLS);
    await readEvm("mythos-mainnet", 42018, CALLS);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(urlOf(vi.mocked(fetch).mock.calls[2])).toContain("mythos-mainnet.g.alchemy.com");
  });
});
