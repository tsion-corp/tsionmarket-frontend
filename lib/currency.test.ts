import { describe, expect, it } from "vitest";
import { NGN_PER_USD, formatNgn, formatUsd, usdToNgn } from "@/lib/currency";

describe("currency", () => {
  it("converts USD to NGN at the demo rate", () => {
    expect(NGN_PER_USD).toBe(1580);
    expect(usdToNgn(1)).toBe(1580);
    expect(usdToNgn(48215)).toBe(76_179_700);
  });

  it("formats USD with two decimals and thousands separators", () => {
    expect(formatUsd(48215)).toBe("$48,215.00");
    expect(formatUsd(1204.18)).toBe("$1,204.18");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("formats NGN with no decimals and thousands separators", () => {
    expect(formatNgn(76_179_700)).toBe("₦76,179,700");
    expect(formatNgn(1234.56)).toBe("₦1,235");
  });
});
