import { describe, expect, it } from "vitest";
import { pnlCardFileName, pnlCardModel } from "./pnl-card";
import type { HlClosedPositionView } from "./hyperliquid-types";

function closedPosition(overrides: Partial<HlClosedPositionView> = {}): HlClosedPositionView {
  return {
    id: "pos-1",
    walletId: "wallet-1",
    assetId: "asset-1",
    symbol: "BTC",
    side: "long",
    size: "0.002",
    entryPrice: "50000",
    leverage: 10,
    marginMode: "isolated",
    status: "closed",
    closeReason: "take_profit",
    closePrice: "52500",
    realizedPnlUsdc: "5",
    openedAt: "2026-09-03T10:00:00.000Z",
    closedAt: "2026-09-03T12:30:00.000Z",
    ...overrides,
  };
}

describe("pnlCardModel", () => {
  it("computes ROI against committed margin, not notional", () => {
    // Notional $100 at 10x = $10 margin; +$5 PnL = +50% ROI.
    const model = pnlCardModel(closedPosition());
    expect(model.roiLabel).toBe("+50.00%");
    expect(model.pnlLabel).toBe("+$5.00");
    expect(model.isWin).toBe(true);
  });

  it("carries the loss sign through ROI and PnL", () => {
    const model = pnlCardModel(closedPosition({ realizedPnlUsdc: "-2.5", side: "short" }));
    expect(model.isWin).toBe(false);
    expect(model.sideLabel).toBe("SHORT");
    expect(model.roiLabel).toBe("-25.00%");
    expect(model.pnlLabel.startsWith("-")).toBe(true);
  });

  it("treats a zero-margin edge as 0% instead of dividing by zero", () => {
    const model = pnlCardModel(closedPosition({ entryPrice: "0", size: "0" }));
    expect(model.roiLabel).toBe("+0.00%");
  });

  it("falls back to 1x when leverage is missing or nonsensical", () => {
    // Same trade at a recorded 0x leverage: margin = full notional ($100),
    // so +$5 reads as +5%.
    const model = pnlCardModel(closedPosition({ leverage: 0 }));
    expect(model.roiLabel).toBe("+5.00%");
  });

  it("labels side, leverage, and duration for the card", () => {
    const model = pnlCardModel(closedPosition());
    expect(model.sideLabel).toBe("LONG");
    expect(model.leverageLabel).toBe("10x isolated");
    expect(model.heldLabel).toBe("2h 30m");
  });

  it("builds a filesystem-safe file name from the symbol", () => {
    const model = pnlCardModel(closedPosition({ symbol: "xyz:AAPL" }));
    expect(pnlCardFileName(model)).toBe("market-xyzAAPL-pnl.png");
  });
});
