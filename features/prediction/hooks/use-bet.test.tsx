import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBet } from "./use-bet";

const mocks = vi.hoisted(() => ({
  ensureReady: vi.fn(),
  fund: vi.fn(),
  readCollateralUsd: vi.fn(),
  waitForCollateralUsd: vi.fn(),
  ensureNegRiskBuyAllowance: vi.fn(),
}));

vi.mock("./use-polymarket-session", () => ({
  usePolymarketSession: () => ({ ensureReady: mocks.ensureReady, status: "idle" }),
}));

vi.mock("./use-polymarket-funding", () => ({
  usePolymarketFunding: () => ({
    fund: mocks.fund,
    usdcTotal: 100,
    portfolioLoading: false,
  }),
}));

vi.mock("../lib/polymarket/collateral", () => ({
  readCollateralUsd: mocks.readCollateralUsd,
  waitForCollateralUsd: mocks.waitForCollateralUsd,
}));

vi.mock("../lib/polymarket/allowance", () => ({
  ensureNegRiskBuyAllowance: mocks.ensureNegRiskBuyAllowance,
}));

describe("useBet", () => {
  beforeEach(() => {
    mocks.ensureReady.mockReset();
    mocks.fund.mockReset();
    mocks.readCollateralUsd.mockReset();
    mocks.waitForCollateralUsd.mockReset();
    mocks.ensureNegRiskBuyAllowance.mockReset();
  });

  it("rejects a stake below five dollars before wallet or bridge work", async () => {
    const { result } = renderHook(() => useBet());

    await act(async () => {
      await expect(
        result.current.placeBet({ tokenId: "market-token", amountUsd: 4.99 })
      ).rejects.toThrow("$5.00 USDC");
    });

    expect(mocks.ensureReady).not.toHaveBeenCalled();
    expect(mocks.fund).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/\$5\.00 USDC/u);
  });

  it("treats the entered stake as the all-in order spend", async () => {
    const client = {
      fetchOrderBook: vi.fn().mockResolvedValue({
        asks: [{ price: "0.50", size: "100" }],
        negRisk: false,
        tickSize: 0.01,
      }),
      estimateMarketPrice: vi.fn().mockResolvedValue(0.5),
      placeMarketOrder: vi.fn().mockResolvedValue({ ok: true, message: "" }),
    };
    mocks.ensureReady.mockResolvedValue(client);
    mocks.readCollateralUsd.mockResolvedValue(5);

    const { result } = renderHook(() => useBet());
    await act(async () => {
      await result.current.placeBet({ tokenId: "market-token", amountUsd: 5 });
    });

    expect(client.placeMarketOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: "5",
        maxSpend: "5",
        maxPrice: "0.52",
      })
    );
    expect(client.placeMarketOrder).toHaveBeenCalledTimes(1);
    expect(result.current.predictionBalanceUsd).toBe(5);
  });

  it("prepares the legacy Neg Risk allowance before posting", async () => {
    const client = {
      fetchOrderBook: vi.fn().mockResolvedValue({
        asks: [{ price: "0.4", size: "100" }],
        negRisk: true,
        tickSize: 0.01,
      }),
      estimateMarketPrice: vi.fn().mockResolvedValue(0.4),
      placeMarketOrder: vi.fn().mockResolvedValue({ ok: true, message: "" }),
    };
    mocks.ensureReady.mockResolvedValue(client);
    mocks.readCollateralUsd.mockResolvedValue(5);

    const { result } = renderHook(() => useBet());
    await act(async () => {
      await result.current.placeBet({ tokenId: "market-token", amountUsd: 5 });
    });

    expect(mocks.ensureNegRiskBuyAllowance).toHaveBeenCalledWith(client, 5_000_000n);
    expect(client.placeMarketOrder).toHaveBeenCalledTimes(1);
  });
});
