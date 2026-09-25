import { describe, expect, it } from "vitest";
import {
  legacyWalletHasFunds,
  legacyWalletMovable,
  legacyWalletUsd,
  legacyWalletWorthMoving,
} from "@/features/migrate/lib/legacy-funds";
import type { LegacyHolding } from "@/lib/migration/types";

function holding(id: string, overrides: Partial<LegacyHolding> = {}): LegacyHolding {
  return {
    id,
    venue: "wallet",
    kind: "token",
    label: id,
    amount: 1n,
    decimals: 6,
    symbol: "USDC",
    valueUsd: 1,
    deterministic: true,
    irreversible: false,
    settleability: { state: "now" },
    ref: null,
    ...overrides,
  };
}

describe("the old wallet, read by the frontend", () => {
  it("is empty with nothing, or nothing above zero", () => {
    expect(legacyWalletHasFunds([])).toBe(false);
    expect(legacyWalletHasFunds([holding("a", { amount: 0n })])).toBe(false);
    expect(legacyWalletUsd([])).toBe(0);
  });

  // The wallet that prompted this: cbXRP $0.92, CHIP $0.40, BLUESCREEN $0.12,
  // DOBBY $0.015 and 17 tokens worth less than a cent. The service saw $0.
  // Every held token counts, whatever its price. The value is a display total,
  // not the filter: a price feed that reports $0 must not hide real tokens.
  it("counts every held token, and prices what it can", () => {
    const list = [
      holding("cbXRP", { symbol: "cbXRP", amount: 5n, valueUsd: 0.92 }),
      holding("CHIP", { symbol: "CHIP", amount: 5n, valueUsd: 0.4 }),
      holding("priceless", { symbol: "ZZZ", amount: 5n, valueUsd: 0 }),
    ];
    expect(legacyWalletHasFunds(list)).toBe(true);
    expect(legacyWalletMovable(list).map((h) => h.id)).toEqual(["cbXRP", "CHIP", "priceless"]);
    // usd is a display total; the unpriced token adds nothing to it.
    expect(legacyWalletUsd(list)).toBeCloseTo(1.32, 6);
  });

  // The case that prompted the switch: prices drop out, every token reads $0,
  // but the balances are real. Money left is decided by balance, not value.
  it("has money left when a held token has no price", () => {
    expect(legacyWalletHasFunds([holding("held", { amount: 1n, valueUsd: 0 })])).toBe(true);
    expect(legacyWalletHasFunds([holding("empty", { amount: 0n, valueUsd: 5 })])).toBe(false);
  });

  it("ignores what cannot move", () => {
    expect(
      legacyWalletHasFunds([
        holding("stuck", { settleability: { state: "stranded", reason: "unsponsoredNetwork" } }),
      ])
    ).toBe(false);
  });
});

// The bar for re-offering a LINKED account. The wallet that prompted this:
// linked, every real balance moved, one unpriced token left — and the offer
// came back on "$0.00 left -> proven".
describe("money worth bringing a linked account back for", () => {
  it("needs a cent by the badge's own total; $0.00 is nothing", () => {
    expect(legacyWalletWorthMoving([holding("usdc", { valueUsd: 0.92 })])).toBe(true);
    expect(legacyWalletWorthMoving([holding("cent", { valueUsd: 0.01 })])).toBe(true);
    expect(legacyWalletWorthMoving([holding("sub-cent", { valueUsd: 0.004 })])).toBe(false);
    // Unpriced, native or not: the figure reads $0.00, so nothing is offered.
    expect(legacyWalletWorthMoving([holding("priceless", { valueUsd: 0 })])).toBe(false);
    expect(
      legacyWalletWorthMoving([holding("eth", { kind: "native", symbol: "ETH", valueUsd: 0 })])
    ).toBe(false);
    // Several sub-cent holdings add up like the badge does.
    expect(
      legacyWalletWorthMoving([
        holding("a", { valueUsd: 0.006 }),
        holding("b", { valueUsd: 0.006 }),
      ])
    ).toBe(true);
  });

  it("is still 'funds' to the sweep even when not worth a re-offer", () => {
    const dust = [holding("priceless", { valueUsd: 0 })];
    expect(legacyWalletHasFunds(dust)).toBe(true);
    expect(legacyWalletWorthMoving(dust)).toBe(false);
  });

  it("ignores what cannot move, whatever it is worth", () => {
    expect(
      legacyWalletWorthMoving([
        holding("stuck", {
          valueUsd: 50,
          settleability: { state: "stranded", reason: "unsponsoredNetwork" },
        }),
      ])
    ).toBe(false);
  });
});
