import { describe, expect, it } from "vitest";
import {
  fixedNgnPerUsdc,
  ngnToDepositUsdc,
  normalizeArkjetAmount,
  usdcUnitsToNgn,
  withdrawalUsdcEstimate,
} from "./arkjet-funding";

describe("Arkjet funding math", () => {
  it("converts NGN deposits to exact micro-USDC without under-crediting", () => {
    expect(ngnToDepositUsdc("10", 2, 6, "160000")).toBe("0.00625");
    expect(ngnToDepositUsdc("10.01", 2, 6, "160000")).toBe("0.006257");
  });

  it("estimates withdrawals after the same integer fee and floor rules as the service", () => {
    expect(withdrawalUsdcEstimate("1000", 2, 6, "160000", 100)).toEqual({
      feeNgn: "10",
      receiveUsdc: "0.61875",
    });
  });

  it("normalizes plain positive NGN input and displays the configured rate", () => {
    expect(normalizeArkjetAmount("0010.00", 2)).toBe("10");
    expect(normalizeArkjetAmount("0", 2)).toBeNull();
    expect(fixedNgnPerUsdc("160000", 2)).toBe("1600");
    expect(usdcUnitsToNgn(6250n, 6, 2, "160000")).toBe("10");
  });
});
