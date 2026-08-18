import { describe, expect, it } from "vitest";
import { rwaPurchaseSpendRaw, rwaSaleProceedsRaw } from "@/lib/trade/pending-settlement";

describe("rwaPurchaseSpendRaw", () => {
  it("uses existing USDC only after a new bridge delivery is confirmed", () => {
    expect(rwaPurchaseSpendRaw(1_000_000n, 40_000n, 1_010_000n)).toBe(1_000_000n);
  });

  it("spends all delivered USDC when route fees leave less than the approved amount", () => {
    expect(rwaPurchaseSpendRaw(1_000_000n, 0n, 970_000n)).toBe(970_000n);
  });

  it("does not treat an existing Solana USDC balance as bridge output", () => {
    expect(rwaPurchaseSpendRaw(1_000_000n, 500_000n, 500_000n)).toBe(0n);
  });

  it("waits when the confirmed balance temporarily falls below the snapshot", () => {
    expect(rwaPurchaseSpendRaw(1_000_000n, 500_000n, 450_000n)).toBe(0n);
  });
});

describe("rwaSaleProceedsRaw", () => {
  it("routes the exact expected proceeds after the sale balance lands", () => {
    expect(rwaSaleProceedsRaw(40_000n, 930_000n, 970_000n, 1_010_000n)).toBe(970_000n);
  });

  it("waits until the minimum sale output has landed", () => {
    expect(rwaSaleProceedsRaw(40_000n, 930_000n, 970_000n, 900_000n)).toBe(0n);
  });

  it("does not sweep more than this sale expected to produce", () => {
    expect(rwaSaleProceedsRaw(40_000n, 930_000n, 970_000n, 2_000_000n)).toBe(970_000n);
  });
});
