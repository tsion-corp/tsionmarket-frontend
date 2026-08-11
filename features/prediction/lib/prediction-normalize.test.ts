import { describe, expect, it } from "vitest";
import {
  PredictionApiError,
  normalizeChart,
  normalizeLpPositions,
  normalizeMarket,
  normalizeMarkets,
  normalizePositions,
  normalizeTrade,
} from "@/features/prediction/lib/normalize";

const RAW_MARKET = {
  marketId: "101",
  creator: "0x45884be0855d7dccceb51ac151fe0dad7128041c",
  question: "Will BTC top $150k by Q3 2026?",
  category: "Crypto",
  imageUrl: "https://res.cloudinary.com/x.jpg",
  status: "Open",
  outcome: "Unresolved",
  closeTime: 1788193407,
  feeBps: 100,
  priceYes: 875351,
  priceNo: 124649,
  rYes: "100000",
  rNo: "100000",
  totalLp: "100000",
  collateral: "100000",
  volumeUsdc: "0",
};

describe("normalizeMarket", () => {
  it("maps 6-dec strings to exact bigints", () => {
    const m = normalizeMarket(RAW_MARKET);
    expect(m.marketId).toBe(101n);
    expect(m.priceYes).toBe(875351n);
    expect(m.rYes).toBe(100_000n);
    expect(m.collateral).toBe(100_000n);
    expect(m.feeBps).toBe(100);
    expect(m.closeTime).toBe(1788193407);
  });

  it("recomputes priceNo from priceYes as the single source of truth", () => {
    // Feed a deliberately wrong priceNo; the normalizer must ignore it.
    const m = normalizeMarket({ ...RAW_MARKET, priceNo: 999999 });
    expect(m.priceNo).toBe(1_000_000n - 875351n);
  });

  it("keeps null metadata null until attached", () => {
    const m = normalizeMarket({ ...RAW_MARKET, question: null, category: null, imageUrl: null });
    expect(m.question).toBeNull();
    expect(m.category).toBeNull();
    expect(m.imageUrl).toBeNull();
  });

  it("throws on an unknown status", () => {
    expect(() => normalizeMarket({ ...RAW_MARKET, status: "Frozen" })).toThrow(PredictionApiError);
  });

  it("throws on an unknown outcome", () => {
    expect(() => normalizeMarket({ ...RAW_MARKET, outcome: "Maybe" })).toThrow(PredictionApiError);
  });

  it("throws on a malformed numeric string", () => {
    expect(() => normalizeMarket({ ...RAW_MARKET, rYes: "12.5" })).toThrow(PredictionApiError);
    expect(() => normalizeMarket({ ...RAW_MARKET, priceYes: "abc" })).toThrow(PredictionApiError);
  });

  it("accepts an empty creator on a not-yet-indexed market", () => {
    const m = normalizeMarket({ ...RAW_MARKET, creator: "" });
    expect(m.creator).toBe("");
  });
});

describe("normalizeMarkets", () => {
  it("keeps valid markets and skips a malformed one instead of failing the list", () => {
    const markets = normalizeMarkets([
      RAW_MARKET,
      { ...RAW_MARKET, marketId: "102", status: "Frozen" }, // bad status -> skipped
      { ...RAW_MARKET, marketId: "103", creator: "" }, // empty creator -> kept
    ]);
    expect(markets.map((m) => m.marketId)).toEqual([101n, 103n]);
  });

  it("throws only when the payload is not a list", () => {
    expect(() => normalizeMarkets({} as unknown)).toThrow(PredictionApiError);
  });
});

describe("normalizeTrade", () => {
  it("maps a trade and its side", () => {
    const t = normalizeTrade({
      txHash: "0xabc",
      trader: "0xdef",
      buy: true,
      side: "yes",
      usdcAmount: "500000",
      shareAmount: "600000",
      priceYes: 875351,
      block: "49406101",
    });
    expect(t.buy).toBe(true);
    expect(t.side).toBe("yes");
    expect(t.usdcAmount).toBe(500_000n);
    expect(t.block).toBe(49406101);
  });

  it("throws on an unknown side", () => {
    expect(() =>
      normalizeTrade({
        txHash: "0x",
        trader: "0x",
        side: "up",
        usdcAmount: "1",
        shareAmount: "1",
        priceYes: 1,
        block: 1,
      })
    ).toThrow(PredictionApiError);
  });
});

describe("normalizeChart", () => {
  it("maps bucketed probability points", () => {
    const pts = normalizeChart([{ t: 1785600000, yes: 875351, no: 124649 }]);
    expect(pts).toEqual([{ t: 1785600000, yes: 875351n, no: 124649n }]);
  });
});

describe("normalizePositions", () => {
  it("takes marketId from the row on the list endpoint", () => {
    const p = normalizePositions([{ marketId: "101", side: "yes", shares: "5", costUsdc: "3" }]);
    expect(p[0].marketId).toBe(101n);
    expect(p[0].side).toBe("yes");
  });

  it("takes marketId from the caller on the per-market endpoint", () => {
    const p = normalizePositions([{ side: "no", shares: "5", costUsdc: "3" }], 202n);
    expect(p[0].marketId).toBe(202n);
    expect(p[0].side).toBe("no");
  });
});

describe("normalizeLpPositions", () => {
  it("maps LP shares", () => {
    const lp = normalizeLpPositions([{ marketId: "101", lpShares: "100000" }]);
    expect(lp[0]).toEqual({ marketId: 101n, lpShares: 100_000n });
  });

  it("throws when the payload is not a list", () => {
    expect(() => normalizeLpPositions({} as unknown)).toThrow(PredictionApiError);
  });
});
