import { describe, expect, it } from "vitest";
import type { TokenBalance } from "@/lib/server/alchemy";
import { isDustHolding, visibleTotalUsd } from "@/lib/portfolio/dust";

function token(partial: Partial<TokenBalance>): TokenBalance {
  return {
    symbol: "SPAM",
    name: "Spam",
    network: "base-mainnet",
    address: "0x0000000000000000000000000000000000000001",
    decimals: 18,
    kind: "token",
    balance: 1,
    rawBalance: "1000000000000000000",
    priceUsd: 0.000001,
    valueUsd: 0.000001,
    logo: null,
    ...partial,
  } as TokenBalance;
}

describe("dust", () => {
  it("counts a token worth a fraction of a cent as dust", () => {
    expect(isDustHolding(token({ valueUsd: 0.0009 }))).toBe(true);
  });

  it("does not count a cent as dust", () => {
    expect(isDustHolding(token({ valueUsd: 0.01 }))).toBe(false);
  });

  // A balance we could not price is worth an unknown amount, not nothing.
  it("does not count an unpriced balance as dust", () => {
    expect(isDustHolding(token({ balance: 5, priceUsd: 0, valueUsd: 0 }))).toBe(false);
  });

  // The report that started this: a wallet that has only ever been sent
  // unsolicited tokens read "<$0.01" instead of "$0.00".
  it("totals a wallet holding only dust as zero", () => {
    const wallet = [
      token({ symbol: "OMI", valueUsd: 0.0004 }),
      token({ symbol: "GOD", valueUsd: 0.000002 }),
      token({ symbol: "SIPHER", valueUsd: 0.003 }),
    ];
    expect(visibleTotalUsd(wallet)).toBe(0);
  });

  it("keeps every holding worth a cent or more", () => {
    const wallet = [
      token({ symbol: "USDC", valueUsd: 12.5 }),
      token({ symbol: "SPAM", valueUsd: 0.0004 }),
      token({ symbol: "ETH", valueUsd: 3.25 }),
    ];
    expect(visibleTotalUsd(wallet)).toBeCloseTo(15.75, 10);
  });
});
