import { describe, expect, it } from "vitest";
import { isValidTradeAmount, newIdempotencyKey, withRiskDefaults } from "@/lib/meme/api";
import type { MemeToken } from "@/lib/meme/api";

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
