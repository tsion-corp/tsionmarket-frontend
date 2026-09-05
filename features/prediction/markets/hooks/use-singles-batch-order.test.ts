import { describe, expect, it } from "vitest";
import {
  formatMinimumStakeE6,
  isDefinitePostOrdersFailure,
  minimumBuyStakeE6,
  minimumPreparedBuyStakeE6,
  requiredPredictionDepositUsd,
  singlesMaxBuyPrice,
} from "./use-singles-batch-order";

describe("singles market-order price protection", () => {
  it("aligns the protected price down to the market tick", () => {
    expect(singlesMaxBuyPrice(2, 0.01)).toBe("0.51");
    expect(singlesMaxBuyPrice(2, 0.005)).toBe("0.515");
  });

  it("caps the maximum order price one tick below one dollar", () => {
    expect(singlesMaxBuyPrice(1.01, 0.01)).toBe("0.99");
  });

  it("keeps the failed Nottingham order price on its one-cent grid", () => {
    expect(singlesMaxBuyPrice(5.06 / 1.95, 0.01)).toBe("0.39");
  });

  it("rejects invalid market tick sizes", () => {
    expect(() => singlesMaxBuyPrice(2, 0)).toThrow(/invalid price increment/i);
  });
});

describe("singles minimum stake", () => {
  it("prices the market-specific minimum share size across asks", () => {
    expect(
      minimumBuyStakeE6(
        {
          minOrderSize: "5",
          negRisk: false,
          tickSize: 0.01,
          asks: [
            { price: "0.04", size: "10" },
            { price: "0.03", size: "2" },
          ],
        },
        "0.05"
      )
    ).toBe(180_000n);
  });

  it("returns null when the protected price has insufficient liquidity", () => {
    expect(
      minimumBuyStakeE6(
        {
          minOrderSize: "5",
          negRisk: false,
          tickSize: 0.01,
          asks: [{ price: "0.06", size: "10" }],
        },
        "0.05"
      )
    ).toBeNull();
  });

  it("preserves sub-cent precision in the required stake", () => {
    expect(formatMinimumStakeE6(17_500n)).toBe("$0.0175");
  });

  it("enforces both the market BUY amount and share minimums on the signed order", () => {
    expect(
      minimumPreparedBuyStakeE6({
        stakeE6: 1_000_000n,
        makerAmountE6: 1_000_000n,
        takerAmountE6: 500_000n,
        minimumSharesE6: 1_000_000n,
      })
    ).toBe(2_000_000n);
    expect(
      minimumPreparedBuyStakeE6({
        stakeE6: 2_000_000n,
        makerAmountE6: 1_500_000n,
        takerAmountE6: 2_000_000n,
        minimumSharesE6: 1_000_000n,
      })
    ).toBe(1_000_000n);
  });
});

describe("singles account funding", () => {
  it("funds only the batch shortfall while respecting the bridge minimum", () => {
    expect(requiredPredictionDepositUsd(1.06, 0)).toBe(2);
    expect(requiredPredictionDepositUsd(3.18, 0)).toBe(3.18);
    expect(requiredPredictionDepositUsd(3.18, 1.18)).toBe(2);
    expect(requiredPredictionDepositUsd(3.18, 4)).toBe(0);
  });
});

describe("batch submission failure classification", () => {
  it("treats client rejections as definite non-submissions", () => {
    expect(isDefinitePostOrdersFailure({ name: "RequestRejectedError", status: 400 })).toBe(true);
    expect(isDefinitePostOrdersFailure({ name: "RateLimitError" })).toBe(true);
  });

  it("requires reconciliation after transport and server failures", () => {
    expect(isDefinitePostOrdersFailure({ name: "TransportError" })).toBe(false);
    expect(isDefinitePostOrdersFailure({ name: "RequestRejectedError", status: 503 })).toBe(false);
    expect(isDefinitePostOrdersFailure({ name: "RequestRejectedError", status: 408 })).toBe(false);
  });
});
