import { describe, expect, it } from "vitest";
import {
  TradeShapeError,
  parseActivityPage,
  parsePortfolioPage,
  parsePortfolioPosition,
  parsePortfolioSummary,
} from "@/lib/meme/parse";
import {
  ACTIVITY_PAGE,
  PORTFOLIO_PAGE,
  PORTFOLIO_POSITION,
  PORTFOLIO_POSITION_DETAIL,
  PORTFOLIO_SUMMARY,
  TRADE_ACTIVITY,
} from "@/lib/api/schemas/trade.fixtures";

// The portfolio, summary, position detail and activity routes, through the
// same schemas the relay judged them by. What matters on the way through: a
// null valuation stays null, decimal strings stay strings, the page meta is
// the server's.

describe("parsePortfolioPage", () => {
  it("keeps the server's meta and every decimal string as sent", () => {
    const page = parsePortfolioPage(PORTFOLIO_PAGE);
    expect(page.meta).toEqual({ page: 1, limit: 50, total: 1 });
    expect(page.items[0]).toMatchObject({
      chain: "base",
      chainId: 8453,
      quantityRemaining: "4",
      averageEntryPriceUsd: "1.25",
      totalPnlUsd: "0",
    });
  });

  it("leaves a null valuation null, never zero", () => {
    const [position] = parsePortfolioPage(PORTFOLIO_PAGE).items;
    expect(position.currentPriceUsd).toBeNull();
    expect(position.currentValueUsd).toBeNull();
    expect(position.unrealizedPnlUsd).toBeNull();
    expect(position.unrealizedReturnPercent).toBeNull();
    expect(position.totalReturnPercent).toBeNull();
  });

  it("fails a page whose position carries a number where a decimal string belongs", () => {
    const drifted = { ...PORTFOLIO_PAGE, items: [{ ...PORTFOLIO_POSITION, totalPnlUsd: 0 }] };
    expect(() => parsePortfolioPage(drifted)).toThrow(TradeShapeError);
  });
});

describe("parsePortfolioSummary", () => {
  it("maps the summary, keeping marketValueComplete", () => {
    expect(parsePortfolioSummary(PORTFOLIO_SUMMARY)).toMatchObject({
      totalPositions: 1,
      marketValueComplete: false,
      totalReturnPercent: null,
      calculatedAt: "2026-09-14T15:12:00.000Z",
    });
  });
});

describe("parsePortfolioPosition", () => {
  it("maps the detail with its confirmed activity", () => {
    const detail = parsePortfolioPosition(PORTFOLIO_POSITION_DETAIL);
    expect(detail.address).toBe(PORTFOLIO_POSITION.address);
    expect(detail.activity).toHaveLength(1);
    expect(detail.activity[0].status).toBe("CONFIRMED");
  });
});

describe("parseActivityPage", () => {
  it("maps activity rows with null fee USD and hash arrays intact", () => {
    const page = parseActivityPage(ACTIVITY_PAGE);
    expect(page.meta.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      side: "BUY",
      usdAmount: "5",
      platformFeeAmountUsd: null,
      transactionHashes: ["0xtx"],
      userOperationHashes: [],
    });
  });

  it("fails an activity row with a status outside the lifecycle", () => {
    const drifted = { ...ACTIVITY_PAGE, items: [{ ...TRADE_ACTIVITY, status: "DONE" }] };
    expect(() => parseActivityPage(drifted)).toThrow(TradeShapeError);
  });
});
