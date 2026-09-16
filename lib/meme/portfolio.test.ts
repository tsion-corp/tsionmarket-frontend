import { afterEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch: apiFetchMock }));

import { TradeApiError } from "@/lib/meme/api";
import {
  PORTFOLIO_MAX_LIMIT,
  PORTFOLIO_PAGE_LIMIT,
  fetchActivity,
  fetchPortfolio,
  fetchPortfolioSummary,
  fetchPosition,
  memePortfolioKeys,
} from "@/lib/meme/portfolio";
import {
  ACTIVITY_PAGE,
  PORTFOLIO_PAGE,
  PORTFOLIO_POSITION,
  PORTFOLIO_POSITION_DETAIL,
  PORTFOLIO_SUMMARY,
} from "@/lib/api/schemas/trade.fixtures";

// The service's portfolio, profit/loss and activity, read through the relay
// with the user's bearer. Scoped by identity on the server, so nothing here
// sends a user id; never cached, because a figure a minute old is the one the
// 60 s poll replaces.

function answer(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  apiFetchMock.mockResolvedValue(
    new Response(JSON.stringify({ success: true, data }), {
      status: init.status ?? 200,
      headers: { "content-type": "application/json", ...init.headers },
    })
  );
}

const call = () => {
  const [path, init, opts] = apiFetchMock.mock.calls[0] as [string, RequestInit, unknown];
  return { path, init, opts };
};

afterEach(() => apiFetchMock.mockReset());

describe("fetchPortfolio", () => {
  it("asks for a page of 50 with the bearer, uncached, and hands back the mapped page", async () => {
    answer(PORTFOLIO_PAGE);
    const page = await fetchPortfolio(1);
    const { path, init, opts } = call();
    expect(path).toBe("/api/trade/portfolio?page=1&limit=50");
    expect(init.cache).toBe("no-store");
    expect(opts).toEqual({ requireAuth: true });
    expect(page.meta).toEqual({ page: 1, limit: 50, total: 1 });
    expect(page.items[0].currentValueUsd).toBeNull();
    expect(PORTFOLIO_PAGE_LIMIT).toBe(50);
  });

  it("narrows to a chain by name", async () => {
    answer(PORTFOLIO_PAGE);
    await fetchPortfolio(3, 50, "solana");
    expect(call().path).toBe("/api/trade/portfolio?page=3&limit=50&chain=solana");
  });

  it("never asks above the contract's maximum of 100", async () => {
    answer(PORTFOLIO_PAGE);
    await fetchPortfolio(1, 500);
    expect(PORTFOLIO_MAX_LIMIT).toBe(100);
    expect(call().path).toBe("/api/trade/portfolio?page=1&limit=100");
  });

  it("turns a drifted body into a BAD_RESPONSE with the relay's request id", async () => {
    answer(
      { ...PORTFOLIO_PAGE, items: [{ ...PORTFOLIO_POSITION, currentPriceUsd: 0 }] },
      { headers: { "x-request-id": "req-drift-7" } }
    );
    const thrown = await fetchPortfolio(1).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(TradeApiError);
    expect((thrown as TradeApiError).code).toBe("BAD_RESPONSE");
    expect((thrown as TradeApiError).requestId).toBe("req-drift-7");
  });

  it("keeps a 401 as the service's failure, not an empty portfolio", async () => {
    apiFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: { code: "UNAUTHORIZED", message: "no", requestId: "req-401" },
        }),
        { status: 401 }
      )
    );
    const thrown = await fetchPortfolio(1).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(TradeApiError);
    expect((thrown as TradeApiError).status).toBe(401);
  });
});

describe("fetchPortfolioSummary", () => {
  it("reads the summary with the bearer", async () => {
    answer(PORTFOLIO_SUMMARY);
    const summary = await fetchPortfolioSummary();
    expect(call().path).toBe("/api/trade/portfolio/summary");
    expect(call().opts).toEqual({ requireAuth: true });
    expect(summary.marketValueComplete).toBe(false);
  });
});

describe("fetchPosition", () => {
  it("names the chain and keeps a Solana mint exactly as written", async () => {
    answer({ ...PORTFOLIO_POSITION_DETAIL, chain: "solana", chainId: 101 });
    const mint = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
    const detail = await fetchPosition("solana", mint);
    expect(call().path).toBe(`/api/trade/portfolio/solana/${mint}`);
    expect(detail.activity).toHaveLength(1);
  });
});

describe("fetchActivity", () => {
  it("pages the feed at 50 by default", async () => {
    answer(ACTIVITY_PAGE);
    const page = await fetchActivity({ page: 2 });
    expect(call().path).toBe("/api/trade/activity?page=2&limit=50");
    expect(page.items[0].side).toBe("BUY");
  });

  it("sends chain, side and status together, as the contract shows", async () => {
    answer(ACTIVITY_PAGE);
    await fetchActivity({ page: 1, limit: 50, chain: "base", side: "BUY", status: "CONFIRMED" });
    expect(call().path).toBe(
      "/api/trade/activity?page=1&limit=50&chain=base&side=BUY&status=CONFIRMED"
    );
  });
});

describe("memePortfolioKeys", () => {
  it("nests every portfolio query under one prefix, so one invalidation reaches all four", () => {
    const prefix = memePortfolioKeys.all;
    for (const key of [
      memePortfolioKeys.summary(),
      memePortfolioKeys.positions("solana"),
      memePortfolioKeys.position("base", "0xabc"),
      memePortfolioKeys.activity({ chain: "base" }),
    ]) {
      expect(key.slice(0, prefix.length)).toEqual([...prefix]);
    }
  });
});
