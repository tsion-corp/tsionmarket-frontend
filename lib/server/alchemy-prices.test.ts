import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPrices, PRICE_SYMBOLS_PER_REQUEST } from "@/lib/server/alchemy";

// Alchemy answers with the symbols it was asked for, priced at 1 each.
function alchemyReply(url: string) {
  const symbols = new URL(url).searchParams.getAll("symbols");
  return new Response(
    JSON.stringify({
      data: symbols.map((symbol) => ({ symbol, prices: [{ currency: "usd", value: "1" }] })),
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("fetchPrices", () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv("ALCHEMY_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        return alchemyReply(url);
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("splits a long symbol list into requests of at most 25 and merges the pages", async () => {
    // Unique symbols so the module cache cannot serve another test's answer.
    const symbols = Array.from({ length: 30 }, (_, i) => `PT${i}`);
    const prices = await fetchPrices(symbols);
    expect(calls).toHaveLength(2);
    for (const url of calls) {
      expect(new URL(url).searchParams.getAll("symbols").length).toBeLessThanOrEqual(
        PRICE_SYMBOLS_PER_REQUEST
      );
    }
    expect(prices).toHaveLength(30);
    expect(prices.find((p) => p.symbol === "PT29")?.priceUsd).toBe(1);
  });

  it("asks once for a short list", async () => {
    await fetchPrices(["PA", "PB"]);
    expect(calls).toHaveLength(1);
  });
});
