import { describe, expect, it } from "vitest";
import {
  estimateLiquidationPrice,
  tierZeroMaintenanceMarginRate,
  type LiquidationInput,
} from "@/features/trade/lib/liquidation";

// Every expected price below was derived by hand from Hyperliquid's own
// formula as an exact rational, then written out at the module's working
// precision. The rational is given next to each case so a reviewer can check
// the arithmetic without running anything.
//
//   liq = price - side * margin_available / position_size / (1 - l * side)

// A 10x long on a 20x market: $1,000 notional at $100, so 10 units of the
// asset behind $100 of isolated collateral.
const BASE: LiquidationInput = {
  side: "long",
  entryPrice: "100",
  notionalUsdc: "1000",
  maintenanceMarginRate: "0.025",
  hasExistingPositionInAsset: false,
  margin: { mode: "isolated", collateralUsdc: "100" },
};

function ok(input: LiquidationInput): string {
  const result = estimateLiquidationPrice(input);
  if (result.status !== "ok") {
    throw new Error(`expected an estimate, got unavailable: ${result.reason}`);
  }
  return result.price;
}

function unavailable(input: LiquidationInput): string {
  const result = estimateLiquidationPrice(input);
  if (result.status !== "unavailable") {
    throw new Error(`expected unavailable, got a price: ${result.price}`);
  }
  return result.reason;
}

describe("estimateLiquidationPrice, isolated margin", () => {
  it("puts a long's liquidation below entry", () => {
    // margin_available = 100 - 1000 * 0.025 = 75, size = 10.
    // 100 - (75 / 10) / (1 - 0.025) = 100 - 100/13 = 1200/13.
    expect(ok(BASE)).toBe("92.307692307692307693");
  });

  it("puts a short's liquidation above entry", () => {
    // 100 + (75 / 10) / (1 + 0.025) = 100 + 300/41 = 4400/41.
    expect(ok({ ...BASE, side: "short" })).toBe("107.317073170731707317");
  });

  it("moves the liquidation closer to entry as leverage rises", () => {
    const tenX = ok(BASE);
    // 20x on the same $1,000 notional: $50 of collateral instead of $100.
    const twentyX = ok({ ...BASE, margin: { mode: "isolated", collateralUsdc: "50" } });
    expect(Number(twentyX)).toBeGreaterThan(Number(tenX));
  });

  it("prices a position opened at the market's maximum leverage", () => {
    // 20x on a 20x market: collateral 50, maintenance 25, available 25.
    // 100 - (25 / 10) / 0.975 = 100 - 100/39 = 3800/39.
    expect(ok({ ...BASE, margin: { mode: "isolated", collateralUsdc: "50" } })).toBe(
      "97.435897435897435898"
    );
  });

  it("is bounded by the precision of the maintenance rate it is given", () => {
    // A 3x market's tier-0 rate is 1/6, which does not terminate. Fed the
    // 18-digit rate, a 3x long on $300 lands a hair under the exact $80 the
    // unrounded rational gives. Nothing here rounds a price; the input is
    // what carries the residue.
    expect(
      ok({
        ...BASE,
        notionalUsdc: "300",
        maintenanceMarginRate: tierZeroMaintenanceMarginRate(3)!,
      })
    ).toBe("79.999999999999999937");
  });
});

describe("estimateLiquidationPrice, cross margin", () => {
  const cross: LiquidationInput = {
    ...BASE,
    margin: { mode: "cross", accountValueUsdc: "200", existingMaintenanceMarginUsdc: "0" },
  };

  it("uses account value rather than the position's own collateral", () => {
    // margin_available = 200 - 0 - 25 = 175, size = 10.
    // 100 - (175 / 10) / 0.975 = 100 - 700/39 = 3200/39.
    expect(ok(cross)).toBe("82.051282051282051283");
  });

  it("prices the short side off the same account figures", () => {
    // 100 + (175 / 10) / 1.025 = 100 + 700/41 = 4800/41.
    expect(ok({ ...cross, side: "short" })).toBe("117.073170731707317073");
  });

  it("subtracts maintenance margin already used by other positions", () => {
    const alone = ok(cross);
    const withOthers = ok({
      ...cross,
      margin: { mode: "cross", accountValueUsdc: "200", existingMaintenanceMarginUsdc: "50" },
    });
    // Less account value is free, so the long liquidates sooner.
    expect(Number(withOthers)).toBeGreaterThan(Number(alone));
  });

  it("reports no liquidation when the account covers the whole move to zero", () => {
    // $5,000 of account value behind a $1,000 long puts the level below zero,
    // which is where Hyperliquid itself returns liquidationPx: null.
    expect(
      unavailable({
        ...cross,
        margin: { mode: "cross", accountValueUsdc: "5000", existingMaintenanceMarginUsdc: "0" },
      })
    ).toBe("unreachable");
  });
});

describe("estimateLiquidationPrice refuses rather than guesses", () => {
  it("gives no estimate for zero notional", () => {
    expect(unavailable({ ...BASE, notionalUsdc: "0" })).toBe("zeroSize");
  });

  it("gives no estimate at zero leverage, which is zero notional", () => {
    // Leverage is not an input; it reaches the model as notional. Zero
    // leverage on $100 of collateral opens nothing.
    expect(unavailable({ ...BASE, notionalUsdc: "0", margin: BASE.margin })).toBe("zeroSize");
  });

  it("gives no estimate when the wallet already holds the asset", () => {
    expect(unavailable({ ...BASE, hasExistingPositionInAsset: true })).toBe("existingPosition");
  });

  it("gives no estimate when collateral is already at or under maintenance", () => {
    // $25 of collateral against $25 of maintenance margin: liquidatable on
    // open, so there is no level to draw.
    expect(unavailable({ ...BASE, margin: { mode: "isolated", collateralUsdc: "25" } })).toBe(
      "belowMaintenance"
    );
  });

  it("gives no estimate for a missing or malformed entry price", () => {
    expect(unavailable({ ...BASE, entryPrice: "" })).toBe("missingInput");
    expect(unavailable({ ...BASE, entryPrice: "0" })).toBe("missingInput");
    expect(unavailable({ ...BASE, entryPrice: "1e5" })).toBe("missingInput");
    expect(unavailable({ ...BASE, entryPrice: "12." })).toBe("missingInput");
  });

  it("gives no estimate for a missing or out-of-range maintenance rate", () => {
    expect(unavailable({ ...BASE, maintenanceMarginRate: "" })).toBe("missingInput");
    expect(unavailable({ ...BASE, maintenanceMarginRate: "0" })).toBe("missingInput");
    expect(unavailable({ ...BASE, maintenanceMarginRate: "1" })).toBe("missingInput");
  });

  it("gives no estimate for a malformed collateral or account value", () => {
    expect(unavailable({ ...BASE, margin: { mode: "isolated", collateralUsdc: "abc" } })).toBe(
      "missingInput"
    );
    expect(
      unavailable({
        ...BASE,
        margin: { mode: "cross", accountValueUsdc: "", existingMaintenanceMarginUsdc: "0" },
      })
    ).toBe("missingInput");
  });

  it("keeps sub-unit precision that a float would lose", () => {
    // 18 significant digits of notional. Parsing this through a double and
    // back changes the number before any maths happens.
    const result = estimateLiquidationPrice({
      ...BASE,
      entryPrice: "0.000000123456789012",
      notionalUsdc: "1000.000000000000000001",
      margin: { mode: "isolated", collateralUsdc: "100.000000000000000001" },
    });
    expect(result.status).toBe("ok");
  });
});

describe("tierZeroMaintenanceMarginRate", () => {
  it("is half the initial margin rate at the tier's max leverage", () => {
    expect(tierZeroMaintenanceMarginRate(20)).toBe("0.025");
    expect(tierZeroMaintenanceMarginRate(40)).toBe("0.0125");
    expect(tierZeroMaintenanceMarginRate(50)).toBe("0.01");
  });

  it("carries a non-terminating rate to the working precision", () => {
    expect(tierZeroMaintenanceMarginRate(3)).toBe("0.166666666666666666");
  });

  it("is null for a max leverage that is not a positive integer", () => {
    expect(tierZeroMaintenanceMarginRate(0)).toBeNull();
    expect(tierZeroMaintenanceMarginRate(-5)).toBeNull();
    expect(tierZeroMaintenanceMarginRate(2.5)).toBeNull();
    expect(tierZeroMaintenanceMarginRate(Number.NaN)).toBeNull();
  });
});
