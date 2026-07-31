import { describe, expect, it, vi } from "vitest";
import { apiError } from "@/lib/casino/api/envelope";
import {
  exceedsUsdcBalance,
  feePctFromBps,
  isCashierUnavailable,
  normalizeUsdcAmount,
  parseUsdcAmount,
} from "@/lib/casino/api/cashier";

// Only the pure helpers are under test; the transport would drag Privy and
// fetch into a unit test for arithmetic.
vi.mock("@/lib/casino/api/chess-client", () => ({
  chessGet: vi.fn(),
  chessPost: vi.fn(),
}));

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
