// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingRwaSettlement,
  pendingRwaSettlementsSnapshot,
  savePendingRwaSettlement,
  settlementsForProduct,
} from "@/lib/trade/pending-settlement";

const purchase = {
  assetAddress: "So11111111111111111111111111111111111111112",
  assetSymbol: "AAA",
  amountInRaw: "2000000",
  startingUsdcRaw: "0",
  minimumDeliveryRaw: "1900000",
  slippageBps: 100,
};

describe("pending settlements by product", () => {
  beforeEach(() => {
    for (const s of pendingRwaSettlementsSnapshot()) clearPendingRwaSettlement(s.requestId);
  });

  // The RWA tracker and the memecoin tracker share one store. Each must see
  // only its own entries: a memecoin purchase handed to the RWA tracker would
  // be built as an RWA order, or cleared as "funds ready" and lost.
  it("files a memecoin purchase under its product", () => {
    savePendingRwaSettlement({
      requestId: "meme-1",
      product: "meme",
      direction: "base-to-solana",
      assetSymbol: "AAA",
      createdAt: Date.now(),
      purchase,
    });
    expect(
      settlementsForProduct(pendingRwaSettlementsSnapshot(), "meme").map((s) => s.requestId)
    ).toEqual(["meme-1"]);
    expect(settlementsForProduct(pendingRwaSettlementsSnapshot(), "rwa")).toEqual([]);
  });

  it("treats an entry saved before products existed as RWA", () => {
    savePendingRwaSettlement({
      requestId: "old-1",
      direction: "solana-to-base",
      assetSymbol: "USDY",
      createdAt: Date.now(),
    });
    expect(
      settlementsForProduct(pendingRwaSettlementsSnapshot(), "rwa").map((s) => s.requestId)
    ).toEqual(["old-1"]);
    expect(settlementsForProduct(pendingRwaSettlementsSnapshot(), "meme")).toEqual([]);
  });

  it("survives a reload with its product intact", () => {
    savePendingRwaSettlement({
      requestId: "meme-2",
      product: "meme",
      direction: "base-to-solana",
      assetSymbol: "AAA",
      createdAt: Date.now(),
      purchase,
    });
    const raw = JSON.parse(window.localStorage.getItem("wsws.rwa.pending-settlements.v1") ?? "[]");
    expect(raw[0].product).toBe("meme");
  });
});
