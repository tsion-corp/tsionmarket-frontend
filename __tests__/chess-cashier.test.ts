import { describe, expect, it, vi } from "vitest";
import { apiError } from "@/lib/casino/api/envelope";
import {
  cashierLockBuckets,
  exceedsUsdcBalance,
  feePctFromBps,
  hasPositiveUsdc,
  isCashierAccessDenied,
  isCashierUnavailable,
  normalizeUsdcAmount,
  parseUsdcAmount,
  wagerBreakdown,
} from "@/lib/casino/api/cashier";

// Only the pure helpers are under test; the transport would drag Privy and
// fetch into a unit test for arithmetic.
vi.mock("@/lib/casino/api/chess-client", () => ({
  chessGet: vi.fn(),
  chessPost: vi.fn(),
}));

describe("wagerBreakdown", () => {
  it("computes a $5 stake on a $6 balance at 5%", () => {
    const b = wagerBreakdown("5", "6", 500);
    expect(b.youLock).toBe("5");
    expect(b.balanceAfter).toBe("1");
    expect(b.pot).toBe("10");
    expect(b.fee).toBe("0.5");
    expect(b.winnerReceives).toBe("9.5");
    expect(b.sufficient).toBe(true);
  });

  it("computes the $1 vs $1 case at 5%", () => {
    const b = wagerBreakdown("1", "1", 500);
    expect(b.pot).toBe("2");
    expect(b.fee).toBe("0.1");
    expect(b.winnerReceives).toBe("1.9");
    expect(b.balanceAfter).toBe("0");
    expect(b.sufficient).toBe(true);
  });

  it("flags an overdraw and clamps balance-after to zero", () => {
    const b = wagerBreakdown("10", "6", 500);
    expect(b.sufficient).toBe(false);
    expect(b.balanceAfter).toBe("0");
    // The pot math still holds regardless of balance.
    expect(b.winnerReceives).toBe("19");
  });

  it("floors the fee to micro-USDC like the service", () => {
    // pot 0.02, 5% = 0.001 exactly, still representable at 6 decimals.
    const b = wagerBreakdown("0.01", "1", 500);
    expect(b.pot).toBe("0.02");
    expect(b.fee).toBe("0.001");
    expect(b.winnerReceives).toBe("0.019");
  });
});

describe("isCashierUnavailable", () => {
  it("treats the service's not-configured answers as unavailable", () => {
    // The live deployment answers CONFLICT while the cashier is unconfigured.
    expect(isCashierUnavailable(apiError("CONFLICT", "cashier is not configured", 409))).toBe(true);
    expect(isCashierUnavailable(apiError("NOT_CONFIGURED", "not configured", 409))).toBe(true);
    expect(isCashierUnavailable(apiError("SERVICE_UNAVAILABLE", "gateway down", 502))).toBe(true);
  });

  it("keeps real faults as faults", () => {
    expect(isCashierUnavailable(apiError("NOT_FOUND", "no such player", 404))).toBe(false);
    expect(isCashierUnavailable(apiError("BAD_REQUEST", "bad amount", 400))).toBe(false);
  });

  it("never crashes on non-envelope errors", () => {
    expect(isCashierUnavailable(new Error("network"))).toBe(false);
    expect(isCashierUnavailable(null)).toBe(false);
    expect(isCashierUnavailable(undefined)).toBe(false);
    expect(isCashierUnavailable("boom")).toBe(false);
  });
});

describe("isCashierAccessDenied", () => {
  it("treats auth and wallet identity failures as terminal", () => {
    expect(isCashierAccessDenied(apiError("UNAUTHORIZED", "sign in", 401))).toBe(true);
    expect(isCashierAccessDenied(apiError("NO_WALLET", "link a wallet", 400))).toBe(true);
  });

  it("does not confuse ordinary service faults with auth faults", () => {
    expect(isCashierAccessDenied(apiError("CONFLICT", "not configured", 409))).toBe(false);
    expect(isCashierAccessDenied(apiError("SERVICE_UNAVAILABLE", "gateway down", 502))).toBe(false);
    expect(isCashierAccessDenied(new Error("network"))).toBe(false);
  });
});

describe("parseUsdcAmount", () => {
  it("parses positive decimals into exact 6-decimal base units", () => {
    expect(parseUsdcAmount("10")).toBe(10_000_000n);
    expect(parseUsdcAmount("0.5")).toBe(500_000n);
    expect(parseUsdcAmount("1.000001")).toBe(1_000_001n);
    expect(parseUsdcAmount(" 25 ")).toBe(25_000_000n);
  });

  it("truncates precision beyond USDC's 6 decimals instead of rounding up", () => {
    expect(parseUsdcAmount("0.0000019")).toBe(1n);
  });

  it("rejects empty, zero, and non-decimal input", () => {
    expect(parseUsdcAmount("")).toBeNull();
    expect(parseUsdcAmount("0")).toBeNull();
    expect(parseUsdcAmount("0.0")).toBeNull();
    expect(parseUsdcAmount(".")).toBeNull();
    expect(parseUsdcAmount("-5")).toBeNull();
    expect(parseUsdcAmount("1,000")).toBeNull();
    expect(parseUsdcAmount("abc")).toBeNull();
    expect(parseUsdcAmount("1e6")).toBeNull();
  });
});

describe("normalizeUsdcAmount", () => {
  it("emits the canonical decimal that goes on the wire", () => {
    expect(normalizeUsdcAmount("10.")).toBe("10");
    expect(normalizeUsdcAmount("05.50")).toBe("5.5");
    expect(normalizeUsdcAmount(" 1 ")).toBe("1");
    expect(normalizeUsdcAmount("0.100000")).toBe("0.1");
  });

  it("truncates past USDC precision rather than inventing sub-unit amounts", () => {
    expect(normalizeUsdcAmount("1.23456789")).toBe("1.234567");
  });

  it("mirrors parseUsdcAmount's rejections", () => {
    expect(normalizeUsdcAmount("")).toBeNull();
    expect(normalizeUsdcAmount("0")).toBeNull();
    expect(normalizeUsdcAmount("abc")).toBeNull();
  });
});

describe("exceedsUsdcBalance", () => {
  it("compares in base units, not floats", () => {
    expect(exceedsUsdcBalance("10", "10")).toBe(false);
    expect(exceedsUsdcBalance("10.000001", "10")).toBe(true);
    // A classic float trap: 0.1 + 0.2 style amounts stay exact in units.
    expect(exceedsUsdcBalance("0.3", "0.3")).toBe(false);
  });

  it("handles a zero or empty balance", () => {
    expect(exceedsUsdcBalance("1", "0")).toBe(true);
    expect(exceedsUsdcBalance("1", "")).toBe(true);
  });

  it("reports invalid amounts as not-over, leaving that to input validation", () => {
    expect(exceedsUsdcBalance("", "5")).toBe(false);
    expect(exceedsUsdcBalance("abc", "5")).toBe(false);
    expect(exceedsUsdcBalance("0", "5")).toBe(false);
  });
});

describe("feePctFromBps", () => {
  it("derives the display percentage from basis points", () => {
    expect(feePctFromBps(500)).toBe(5);
    expect(feePctFromBps(0)).toBe(0);
    expect(feePctFromBps(25)).toBe(0.25);
    expect(feePctFromBps(10_000)).toBe(100);
  });
});

describe("cashierLockBuckets", () => {
  it("fills missing bucket fields with zero", () => {
    expect(
      cashierLockBuckets({
        player: "0xabc",
        availableUsdc: "10",
        lockedUsdc: "0",
        totalUsdc: "10",
      })
    ).toEqual({
      lockedMatchUsdc: "0",
      lockedSwissUsdc: "0",
      lockedBetUsdc: "0",
      pendingWithdrawalUsdc: "0",
      lockedOtherUsdc: "0",
    });
  });

  it("normalizes positive bucket values for display", () => {
    expect(
      cashierLockBuckets({
        player: "0xabc",
        availableUsdc: "5",
        lockedUsdc: "2.750000",
        lockedMatchUsdc: "2.5",
        lockedSwissUsdc: "0.25",
        lockedBetUsdc: "0",
        pendingWithdrawalUsdc: "0.000000",
        lockedOtherUsdc: "0",
        totalUsdc: "7.75",
      })
    ).toEqual({
      lockedMatchUsdc: "2.5",
      lockedSwissUsdc: "0.25",
      lockedBetUsdc: "0",
      pendingWithdrawalUsdc: "0",
      lockedOtherUsdc: "0",
    });
  });
});

describe("hasPositiveUsdc", () => {
  it("distinguishes zero buckets from real locks", () => {
    expect(hasPositiveUsdc("0")).toBe(false);
    expect(hasPositiveUsdc("0.000000")).toBe(false);
    expect(hasPositiveUsdc("0.000001")).toBe(true);
    expect(hasPositiveUsdc("2.5")).toBe(true);
  });
});
