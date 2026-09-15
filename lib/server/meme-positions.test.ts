import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMemePositions } from "@/lib/server/meme-positions";

// A position the trade service reports for the signed-in user. Only the fields
// the registry reads are filled; the contract's other 40 are irrelevant here.
function position(over: Partial<Record<string, unknown>> = {}) {
  return {
    chain: "base",
    chainId: 8453,
    address: "0xAbCdEf0000000000000000000000000000000001",
    logoUrl: "https://img/coin.png",
    currentPriceUsd: "0.00042",
    ...over,
  };
}

function reply(items: unknown[], total = items.length) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { items, meta: { page: 1, limit: 100, total } } }),
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("fetchMemePositions", () => {
  // The defect this exists for: prod built the memecoin half of the holdings
  // allowlist from one page of the public catalogue, which on 2026-09-15 held
  // 121,383 tokens. A coin bought outside that page was filtered out of the
  // owner's own portfolio. The user's positions are the authoritative answer
  // and take one call.
  it("allows every coin the service says the user holds, whatever the catalogue lists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        reply([position(), position({ address: "0x00000000000000000000000000000000000000ff" })])
      );
    vi.stubGlobal("fetch", fetchMock);

    const { buyable, meme } = await fetchMemePositions("Bearer token");

    expect(buyable["base-mainnet"]).toEqual(
      new Set([
        "0xabcdef0000000000000000000000000000000001",
        "0x00000000000000000000000000000000000000ff",
      ])
    );
    expect(meme["base-mainnet"]?.get("0xabcdef0000000000000000000000000000000001")).toEqual({
      logo: "https://img/coin.png",
      priceUsd: 0.00042,
    });
  });

  it("carries the caller's bearer and asks only for their own positions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply([]));
    vi.stubGlobal("fetch", fetchMock);

    await fetchMemePositions("Bearer abc");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/portfolio?");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer abc");
  });

  // Solana mints are base58 and case-sensitive. The registry is a
  // case-insensitive lookup shared with EVM, so the key is lowercased like
  // every other; what must never happen is the lowercased form being sent back
  // to the service or shown as the address.
  it("recognises Solana positions on the Solana network", async () => {
    const mint = "x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply([position({ chain: "solana", chainId: 101, address: mint })]))
    );

    const { buyable } = await fetchMemePositions("Bearer token");

    expect(buyable["solana-mainnet"]).toEqual(new Set([mint.toLowerCase()]));
    expect(buyable["base-mainnet"]).toBeUndefined();
  });

  it("reads no position at all without a bearer, rather than calling the service", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { buyable, meme } = await fetchMemePositions(null);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(buyable).toEqual({});
    expect(meme).toEqual({});
  });

  // A holding with no current price is still a holding. Null must not become a
  // price of zero here, because zero is what hid it in the first place.
  it("keeps an unpriced position, with no price rather than a zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply([position({ currentPriceUsd: null, logoUrl: null })]))
    );

    const { buyable, meme } = await fetchMemePositions("Bearer token");

    expect(buyable["base-mainnet"]?.size).toBe(1);
    expect(meme["base-mainnet"]?.get("0xabcdef0000000000000000000000000000000001")).toEqual({
      logo: null,
      priceUsd: 0,
    });
  });

  // The trade service being down, slow or unauthenticated must never blank a
  // portfolio that the chain can still answer.
  it("gives an empty registry when the service fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream down")));

    await expect(fetchMemePositions("Bearer token")).resolves.toEqual({ buyable: {}, meme: {} });
  });
});
