import { describe, expect, it } from "vitest";
import {
  buildOndoRow,
  formatCompactUsd,
  formatPercent,
  ONDO_PRODUCTS,
  type OndoMarket,
  type OndoProduct,
} from "@/lib/ondo";

const usdy = ONDO_PRODUCTS.find((p) => p.id === "ondo-us-dollar-yield") as OndoProduct;
const nvda = ONDO_PRODUCTS.find((p) => p.id === "nvidia-ondo-tokenized-stock") as OndoProduct;

function market(overrides: Partial<OndoMarket> = {}): OndoMarket {
  return {
    id: "ondo-us-dollar-yield",
    symbol: "USDY",
    priceUsd: 1.13,
    change24h: 0.0262,
    change1y: 3.62,
    marketCap: 2148950776,
    ...overrides,
  };
}

describe("formatPercent", () => {
  it("prefixes a plus sign on non-negative values", () => {
    expect(formatPercent(3.62)).toBe("+3.62%");
    expect(formatPercent(0)).toBe("+0.00%");
  });

  it("keeps the minus sign on negative values", () => {
    expect(formatPercent(-1.1)).toBe("-1.10%");
  });

  it("returns an em dash when the value is missing", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
  });
});

describe("formatCompactUsd", () => {
  it("compacts large market caps", () => {
    expect(formatCompactUsd(2148950776)).toBe("$2.15B");
    expect(formatCompactUsd(405587881)).toBe("$405.59M");
  });

  it("returns an em dash for zero or invalid input", () => {
    expect(formatCompactUsd(0)).toBe("—");
    expect(formatCompactUsd(Number.NaN)).toBe("—");
  });
});

describe("buildOndoRow", () => {
  it("merges live market numbers into display-ready labels", () => {
    const row = buildOndoRow(usdy, market());
    expect(row.hasData).toBe(true);
    expect(row.priceLabel).toBe("$1.13");
    expect(row.change24hLabel).toBe("+0.03%");
    expect(row.up).toBe(true);
    expect(row.mcapLabel).toBe("$2.15B");
  });

  it("labels the trailing metric as yield only for yield-bearing products", () => {
    expect(buildOndoRow(usdy, market()).metricLabel).toBe("1Y yield");
    expect(buildOndoRow(nvda, market({ id: nvda.id })).metricLabel).toBe("1Y");
  });

  it("marks a down move from a negative 24h change", () => {
    const row = buildOndoRow(nvda, market({ id: nvda.id, change24h: -2.4 }));
    expect(row.up).toBe(false);
    expect(row.change24hLabel).toBe("-2.40%");
  });

  it("falls back to placeholders when there is no market data", () => {
    const row = buildOndoRow(usdy, undefined);
    expect(row.hasData).toBe(false);
    expect(row.priceLabel).toBe("—");
    expect(row.change24hLabel).toBe("—");
    expect(row.metricValue).toBe("—");
    expect(row.mcapLabel).toBe("—");
  });
});
