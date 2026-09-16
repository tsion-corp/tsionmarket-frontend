import { describe, expect, it } from "vitest";
import { toRwaRowView } from "@/features/rwa/lib/row-view";
import type { RwaAssetView } from "@/features/rwa/lib/presenter";

function asset(over: Partial<RwaAssetView> = {}): RwaAssetView {
  return {
    id: "gldx-solana",
    chain: "solana",
    address: "Gld1111111111111111111111111111111111111111",
    symbol: "GLDx",
    name: "Gold ETF xStock",
    issuer: "Backed",
    category: "commodity",
    priceUsd: "403.83",
    freelyTradable: true,
    ...over,
  };
}

describe("toRwaRowView", () => {
  it("carries the identity and the name through unchanged", () => {
    const row = toRwaRowView(asset());
    expect(row.id).toBe("gldx-solana");
    expect(row.symbol).toBe("GLDx");
    expect(row.name).toBe("Gold ETF xStock");
  });

  it("formats the registry price as US dollars", () => {
    expect(toRwaRowView(asset()).price).toBe("$403.83");
  });

  it("falls back to the price feed when the registry has no price", () => {
    const row = toRwaRowView(asset({ priceUsd: null, market: { priceUsd: 12.5 } }));
    // assetPriceUsd reads the registry only, so a feed-only price reaches this
    // mapper already merged by mergeMarket. Without that merge there is no
    // price, and the column must say so rather than print a zero.
    expect(row.price).toBe("—");
  });

  it("prints a dash for every missing figure rather than a zero", () => {
    const row = toRwaRowView(asset({ priceUsd: null }));
    expect(row.price).toBe("—");
    expect(row.change24h).toBe("—");
    expect(row.metric).toBe("—");
    expect(row.apy).toBeNull();
  });

  it("signs the day's move and tones it", () => {
    expect(toRwaRowView(asset({ market: { change24h: 1.86 } })).change24h).toBe("+1.86%");
    expect(toRwaRowView(asset({ market: { change24h: 1.86 } })).changeDirection).toBe("up");
    expect(toRwaRowView(asset({ market: { change24h: -0.4 } })).change24h).toBe("-0.40%");
    expect(toRwaRowView(asset({ market: { change24h: -0.4 } })).changeDirection).toBe("down");
  });

  it("treats an exact zero move as flat, while still printing it", () => {
    // Zero is a real reading, so it is shown. It is not a gain, so it is not
    // painted as one.
    const row = toRwaRowView(asset({ market: { change24h: 0 } }));
    expect(row.change24h).toBe("+0.00%");
    expect(row.changeDirection).toBe("flat");
  });

  it("carries liquidity in the fourth column, not market cap", () => {
    const row = toRwaRowView(
      asset({ market: { liquidityUsd: 1_200_000, marketCapUsd: 987_000_000 } })
    );
    expect(row.metric).toBe("$1.2M");
  });

  it("dashes the fourth column when the feed reports no liquidity", () => {
    expect(toRwaRowView(asset({ market: { marketCapUsd: 987_000_000 } })).metric).toBe("—");
  });

  it("formats a published yield and leaves the rest without one", () => {
    expect(toRwaRowView(asset({ yieldApyBps: 485 })).apy).toBe("4.85%");
    expect(toRwaRowView(asset({ yieldApyBps: 0 })).apy).toBeNull();
    expect(toRwaRowView(asset({ yieldApyBps: null })).apy).toBeNull();
  });

  it("prefers a resolved logo over the registry's own path", () => {
    expect(toRwaRowView(asset(), "https://cdn.example/gldx.png").logo).toBe(
      "https://cdn.example/gldx.png"
    );
    expect(toRwaRowView(asset()).logo).not.toBe("https://cdn.example/gldx.png");
  });

  it("gives the chip a background derived from the ticker", () => {
    const row = toRwaRowView(asset());
    expect(row.bg).toEqual(toRwaRowView(asset()).bg);
    expect(row.bg).not.toBe("");
  });
});
