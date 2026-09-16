import { afterEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

import {
  SCREENER_PAGE_LIMIT,
  TRENDING_BOARD_LIMIT,
  TradeApiError,
  fetchScreenerPage,
  fetchSwapStatus,
  fetchToken,
  fetchTrendingBoard,
  searchTokens,
  isValidTradeAmount,
  newIdempotencyKey,
  registerSubmission,
  withRiskDefaults,
} from "@/lib/meme/api";
import type { MemeToken } from "@/lib/meme/api";
import { LIVE_TOKEN_PAGE } from "@/lib/api/schemas/trade.fixtures";

describe("newIdempotencyKey", () => {
  it("returns a v4 UUID", () => {
    expect(newIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("never repeats across calls", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe("isValidTradeAmount", () => {
  it("accepts plain decimals within the token's precision", () => {
    expect(isValidTradeAmount("12", 6)).toBe(true);
    expect(isValidTradeAmount("12.5", 6)).toBe(true);
    expect(isValidTradeAmount("0.000001", 6)).toBe(true);
  });

  it("rejects zero, signs, exponents and excess precision", () => {
    expect(isValidTradeAmount("0", 6)).toBe(false);
    expect(isValidTradeAmount("-1", 6)).toBe(false);
    expect(isValidTradeAmount("1e3", 6)).toBe(false);
    expect(isValidTradeAmount("1,000", 6)).toBe(false);
    expect(isValidTradeAmount("0.0000001", 6)).toBe(false);
    expect(isValidTradeAmount("", 6)).toBe(false);
  });
});

describe("withRiskDefaults", () => {
  // /tokens/trending omits riskLevel, warnings, buyEnabled and sellEnabled
  // entirely. Rendering one of those rows raw crashed the dashboard, because
  // RiskBadge called .charAt on a missing level and Next replaced the whole
  // page with its unrecoverable-error screen.
  const trendingRow = {
    chainId: 8453,
    address: "0xabc",
    name: "Test",
    symbol: "TEST",
  } as unknown as MemeToken;

  it("fills the risk block a trending row does not carry", () => {
    const t = withRiskDefaults(trendingRow);
    expect(t.riskLevel).toBe("UNKNOWN");
    expect(t.warnings).toEqual([]);
  });

  it("leaves a token that already has a risk block untouched", () => {
    const rated = { ...trendingRow, riskLevel: "HIGH", warnings: [{ code: "X", message: "y" }] };
    const t = withRiskDefaults(rated as unknown as MemeToken);
    expect(t.riskLevel).toBe("HIGH");
    expect(t.warnings).toHaveLength(1);
  });

  it("treats unknown tradability as tradable, since the server re-checks it", () => {
    const t = withRiskDefaults(trendingRow);
    expect(t.buyEnabled).toBe(true);
    expect(t.sellEnabled).toBe(true);
  });
});

// The contract's failure envelope carries a requestId that support asks for.
// It has to survive the client boundary on the error itself, and the relay's
// own errors (a 502 it minted) carry one too, so a screenshot always has a
// reference whichever side failed.
describe("TradeApiError keeps the contract's requestId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    apiFetchMock.mockReset();
  });

  function answer(status: number, body: unknown) {
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      })
    );
  }

  it("carries the service's requestId, code and status on the thrown error", async () => {
    answer(422, {
      success: false,
      error: {
        code: "NO_SWAP_ROUTE",
        message: "no route",
        details: null,
        requestId: "req-service-1",
      },
    });
    const thrown = await fetchSwapStatus("swap-1").catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(TradeApiError);
    const error = thrown as TradeApiError;
    expect(error.code).toBe("NO_SWAP_ROUTE");
    expect(error.status).toBe(422);
    expect(error.requestId).toBe("req-service-1");
  });

  it("carries the relay's minted requestId on a 502 it produced itself", async () => {
    answer(502, {
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Trading is unreachable.",
        requestId: "req-relay-9",
      },
    });
    const thrown = await fetchSwapStatus("swap-1").catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(TradeApiError);
    expect((thrown as TradeApiError).requestId).toBe("req-relay-9");
  });

  it("has no requestId when the body carried none, rather than inventing one", async () => {
    answer(500, "<html>upstream</html>");
    const thrown = await fetchSwapStatus("swap-1").catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(TradeApiError);
    expect((thrown as TradeApiError).requestId).toBeNull();
  });
});

// Base execution registers exactly one hash per call. The contract accepts
// either the transaction hash or, when the bundler never produced a receipt,
// the user-operation hash; the body must carry one and never both.
describe("registerSubmission", () => {
  afterEach(() => apiFetchMock.mockReset());

  function sentBody(): Record<string, unknown> {
    const init = apiFetchMock.mock.calls[0][1] as RequestInit;
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  }

  it("registers a transaction hash", async () => {
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { swapId: "s", status: "SUBMITTED" } }))
    );
    await registerSubmission("s", 0, "0xwallet", { transactionHash: "0xtx" }, "key-1");
    expect(sentBody()).toEqual({
      walletAddress: "0xwallet",
      callIndex: 0,
      transactionHash: "0xtx",
    });
  });

  it("registers a user-operation hash when that is all the bundler gave back", async () => {
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { swapId: "s", status: "SUBMITTED" } }))
    );
    await registerSubmission("s", 1, "0xwallet", { userOperationHash: "0xuop" }, "key-2");
    const body = sentBody();
    expect(body).toEqual({ walletAddress: "0xwallet", callIndex: 1, userOperationHash: "0xuop" });
    expect(body).not.toHaveProperty("transactionHash");
  });
});

// request<T> no longer casts the envelope's data to whatever the caller hoped
// for: it parses through lib/meme/parse.ts, so a drifted body is a typed
// failure carrying a request id, not a half-shaped object in a component.
describe("responses are parsed, not cast", () => {
  afterEach(() => apiFetchMock.mockReset());

  function answer(data: unknown, headers: Record<string, string> = {}) {
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { "content-type": "application/json", ...headers },
      })
    );
  }

  it("turns a drifted body into a BAD_RESPONSE TradeApiError", async () => {
    answer({ swapId: "swap-1", status: "DONE" }, { "x-request-id": "req-drift-1" });
    const thrown = await fetchSwapStatus("swap-1").catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(TradeApiError);
    const error = thrown as TradeApiError;
    expect(error.code).toBe("BAD_RESPONSE");
    expect(error.requestId).toBe("req-drift-1");
  });

  it("hands back the mapped token, with the risk block search omits filled", async () => {
    answer([
      {
        chainId: 8453,
        address: "0xaaa",
        name: "AAA",
        symbol: "AAA",
        decimals: 18,
        logoUrl: null,
        priceUsd: "1",
        liquidityUsd: "1000000",
        volume24hUsd: "25000",
        priceChange24hPercent: null,
        marketCapUsd: null,
        fdvUsd: null,
        pairAddress: null,
        dexName: null,
        riskLevel: "LOW",
      },
    ]);
    const [row] = await searchTokens("aaa");
    expect(row.warnings).toEqual([]);
    expect(row.priceChange24hPercent).toBeNull();
  });

  it("rejects a detail read that lost its risk level", async () => {
    answer({ chainId: 8453, address: "0xaaa", name: null, symbol: null });
    const thrown = await fetchToken("0xaaa", 8453).catch((e: unknown) => e);
    expect((thrown as TradeApiError).code).toBe("BAD_RESPONSE");
  });
});

// The screener's two reads. The query string is built by lib/meme/screener and
// is passed through as given; these only put it on the right route with the
// right page size, parse the page, and let a failure through untouched.
describe("screener reads", () => {
  afterEach(() => apiFetchMock.mockReset());

  // A fresh Response per call, since a body can only be read once.
  function answerPage(status = 200, body: unknown = { success: true, data: LIVE_TOKEN_PAGE }) {
    apiFetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        })
    );
  }

  const requestedPath = () => apiFetchMock.mock.calls[0][0] as string;

  it("asks for a filtered catalogue page of 500 with the query appended", async () => {
    answerPage();
    await fetchScreenerPage(2, "maxMarketCapUsd=1000000&sortBy=volume&sortOrder=desc");
    expect(SCREENER_PAGE_LIMIT).toBe(500);
    expect(requestedPath()).toBe(
      "/api/trade/tokens?page=2&limit=500&maxMarketCapUsd=1000000&sortBy=volume&sortOrder=desc"
    );
  });

  it("asks for a plain catalogue page when the query is empty", async () => {
    answerPage();
    await fetchScreenerPage(1, "");
    expect(requestedPath()).toBe("/api/trade/tokens?page=1&limit=500");
  });

  it("asks trending for 100 rows by default, with the query appended", async () => {
    answerPage();
    await fetchTrendingBoard("minLiquidityUsd=10000");
    expect(TRENDING_BOARD_LIMIT).toBe(100);
    expect(requestedPath()).toBe("/api/trade/tokens/trending?limit=100&minLiquidityUsd=10000");
  });

  it("asks trending without a trailing separator when the query is empty", async () => {
    answerPage();
    await fetchTrendingBoard("", 40);
    expect(requestedPath()).toBe("/api/trade/tokens/trending?limit=40");
  });

  it("never asks trending for more than the contract's 500", async () => {
    answerPage();
    await fetchTrendingBoard("", 2_000);
    expect(requestedPath()).toBe("/api/trade/tokens/trending?limit=500");
  });

  it("parses both pages through the token page mapper and keeps the server's meta", async () => {
    answerPage();
    const screener = await fetchScreenerPage(1, "");
    answerPage();
    const trending = await fetchTrendingBoard("");
    for (const page of [screener, trending]) {
      expect(page.meta).toEqual({ page: 1, limit: 2, total: 105200 });
      // Parsed, not judged: the HIGH risk Solana row the curated view would
      // drop is still here, because the view is applied in the hook.
      expect(page.items.map((token) => token.symbol)).toEqual(["$HACHIKO", "MENTE"]);
      expect(page.items[0].warnings[0].code).toBe("LOW_LIQUIDITY");
    }
  });

  it("turns a drifted page into a BAD_RESPONSE rather than a half-shaped list", async () => {
    answerPage(200, { success: true, data: { items: LIVE_TOKEN_PAGE.items } });
    const thrown = await fetchTrendingBoard("").catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(TradeApiError);
    expect((thrown as TradeApiError).code).toBe("BAD_RESPONSE");
  });

  it("lets a service failure through as a TradeApiError, with no fallback read", async () => {
    answerPage(503, {
      success: false,
      error: { code: "PROVIDER_ERROR", message: "down", requestId: "req-trend-1" },
    });
    const trending = await fetchTrendingBoard("").catch((e: unknown) => e);
    expect(trending).toBeInstanceOf(TradeApiError);
    expect((trending as TradeApiError).code).toBe("PROVIDER_ERROR");
    expect((trending as TradeApiError).status).toBe(503);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    const screener = await fetchScreenerPage(1, "sortBy=age&sortOrder=asc").catch(
      (e: unknown) => e
    );
    expect(screener).toBeInstanceOf(TradeApiError);
    expect((screener as TradeApiError).requestId).toBe("req-trend-1");
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
});
