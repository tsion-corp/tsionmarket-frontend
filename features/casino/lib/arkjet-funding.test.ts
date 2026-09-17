import { describe, expect, it } from "vitest";
import { normalizeArkjetAmount, withdrawalUsdcEstimate } from "./arkjet-funding";

describe("Arkjet funding math", () => {
  it("estimates native USDC withdrawals after integer fee rounding", () => {
    expect(withdrawalUsdcEstimate("1", 6, 100)).toEqual({
      feeUsdc: "0.01",
      receiveUsdc: "0.99",
    });
  });

  it("normalizes positive USDC input to six decimal places", () => {
    expect(normalizeArkjetAmount("000.100000", 6)).toBe("0.1");
    expect(normalizeArkjetAmount("0.000001", 6)).toBe("0.000001");
    expect(normalizeArkjetAmount("0", 6)).toBeNull();
  });

  it("rejects excess precision instead of silently changing the transfer amount", () => {
    expect(normalizeArkjetAmount("0.1000001", 6)).toBeNull();
    expect(normalizeArkjetAmount("1e6", 6)).toBeNull();
    expect(normalizeArkjetAmount("-1", 6)).toBeNull();
  });
});
