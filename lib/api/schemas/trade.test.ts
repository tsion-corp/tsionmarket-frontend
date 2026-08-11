import { describe, expect, it } from "vitest";
import { checkUpstream } from "@/lib/server/validate-upstream";
import { swapQuoteSchema, tradeSchemaFor } from "@/lib/api/schemas/trade";

const ok = (data: unknown) => ({ success: true, data });

// Captured from /v1/trade/tokens/trending. A newly listed token has no market
// data, which is why almost every price field is nullable.
const CBXRP = {
  chainId: 8453,
  address: "0xcb585250f852c6c6bf90434ab21a00f02833a4af",
  name: "Coinbase Wrapped XRP",
  symbol: "cbXRP",
  decimals: 6,
  logoUrl: "https://cdn.dexscreener.com/cms/images/9e67.png",
  priceUsd: "1.018",
  liquidityUsd: "554876.17",
  volume24hUsd: "916787.72",
  priceChange24hPercent: "-0.42",
  marketCapUsd: "1000",
  fdvUsd: "1000",
  pairAddress: "0xabc",
  dexName: "aerodrome",
  riskLevel: "LOW",
  buyEnabled: true,
  sellEnabled: true,
  warnings: [],
};

const COLD = { ...CBXRP, logoUrl: null, priceUsd: null, liquidityUsd: null, fdvUsd: null };

describe("trade token schemas", () => {
  it("accepts a token with no market data yet", () => {
    const body = ok({ items: [COLD] });
    expect(checkUpstream(tradeSchemaFor("tokens"), body, { service: "trade", path: "tokens" }).ok);
  });

  it("accepts the wrapped list shape", () => {
    const check = checkUpstream(tradeSchemaFor("tokens/trending"), ok({ items: [CBXRP] }), {
      service: "trade",
      path: "tokens/trending",
    });
    expect(check.ok).toBe(true);
  });

  it("accepts the bare array that search returns instead", () => {
    const check = checkUpstream(tradeSchemaFor("tokens/search"), ok([CBXRP]), {
      service: "trade",
      path: "tokens/search",
    });
    expect(check.ok).toBe(true);
  });

  it("rejects the wrapped shape on search, which would mean the API changed", () => {
    const check = checkUpstream(tradeSchemaFor("tokens/search"), ok({ items: [CBXRP] }), {
      service: "trade",
      path: "tokens/search",
    });
    expect(check.ok).toBe(false);
  });

  it("ignores the query string when matching a path", () => {
    expect(tradeSchemaFor("tokens?page=1&limit=20")).toBeTruthy();
  });

  it("leaves unguarded paths alone", () => {
    expect(tradeSchemaFor("swaps/abc/status")).toBeNull();
  });
});

describe("swap quote schema", () => {
  it("requires the calls the wallet will sign", () => {
    const check = checkUpstream(swapQuoteSchema, ok({ swapId: "s1" }), {
      service: "trade",
      path: "swaps/quote",
    });
    expect(check.ok).toBe(false);
    expect(check.problem).toContain("calls");
  });

  it("accepts a well-formed quote", () => {
    const body = ok({ swapId: "s1", calls: [{ to: "0xabc", data: "0x", value: "0" }] });
    const check = checkUpstream(swapQuoteSchema, body, { service: "trade", path: "swaps/quote" });
    expect(check.ok).toBe(true);
  });
});
