import { describe, expect, it } from "vitest";
import { subscriptZeros } from "@/lib/format";
import { COMPACT_ABOVE, formatMoney } from "@/lib/currencies";
import { priceLabel } from "@/features/trade/components/meme-bits";

const USD = { code: "USD", name: "US Dollar", symbol: "$", region: "Global" } as const;
const usd = (n: number) => formatMoney(n, USD, 1);
// A zero-decimal, weak currency: the case the compact threshold exists for.
const NGN = { code: "NGN", name: "Nigerian Naira", symbol: "₦", region: "Africa" } as const;
const ngn = (usdAmount: number, rate = 1600) => formatMoney(usdAmount, NGN, rate);

describe("subscriptZeros", () => {
  it("counts the zero run instead of spelling it out", () => {
    // The dust value from the portfolio donut: 0.0000000000000001751.
    expect(subscriptZeros(1.751e-16)).toBe("0.0₁₅1751");
    expect(subscriptZeros(1.234e-7)).toBe("0.0₆1234");
  });

  it("trims trailing zeros from the kept digits", () => {
    expect(subscriptZeros(1.5e-16)).toBe("0.0₁₅15");
    expect(subscriptZeros(1e-8)).toBe("0.0₇1");
  });

  it("declines amounts whose zeros still read at a glance", () => {
    expect(subscriptZeros(0.001751)).toBeNull();
    expect(subscriptZeros(0.07)).toBeNull();
    expect(subscriptZeros(1.79)).toBeNull();
  });

  it("declines what is not a positive finite number", () => {
    expect(subscriptZeros(0)).toBeNull();
    expect(subscriptZeros(-1e-16)).toBeNull();
    expect(subscriptZeros(NaN)).toBeNull();
  });

  it("names the run from the rounded mantissa, not the input", () => {
    // 9.9999e-5 rounds up to 1.000e-4. Counting zeros off the input would name
    // four of them and render 0.00001 — a tenth of the actual amount.
    expect(subscriptZeros(9.9999e-5)).toBe("0.0₃1");
    expect(Number("0.0001")).toBeCloseTo(9.9999e-5, 7);
  });
});

describe("formatMoney", () => {
  it("rounds a dust balance up to the smallest displayed unit", () => {
    expect(usd(1.751e-16)).toBe("<$0.01");
    expect(usd(0.00034514)).toBe("<$0.01");
    expect(usd(0.0099)).toBe("<$0.01");
  });

  it("leaves ordinary amounts alone", () => {
    expect(usd(1.79)).toBe("$1.79");
    expect(usd(0.07)).toBe("$0.07");
    expect(usd(0.01)).toBe("$0.01");
    expect(usd(0)).toBe("$0.00");
  });

  it("shows figures below the threshold in full", () => {
    expect(usd(9_999)).toBe("$9,999.00");
    // 2,994 naira: an ordinary small balance, which must stay exact.
    expect(ngn(2994 / 1600)).toBe("₦2,994");
  });

  it("abbreviates from the threshold up", () => {
    expect(usd(COMPACT_ABOVE)).toBe("$10K");
    expect(usd(1_234_567)).toBe("$1.23M");
    // An ETH price in naira, the case that overflowed a table cell.
    expect(ngn(2022.32)).toBe("₦3.24M");
  });

  it("abbreviates a negative the same way, keeping the sign", () => {
    expect(usd(-1_234_567)).toBe("$-1.23M");
  });

  it("keeps two decimals when compacting a zero-decimal currency", () => {
    // "₦3M" would drop more precision than the suffix saves.
    expect(ngn(2022.32)).toContain(".24");
  });
});

describe("priceLabel", () => {
  it("shares the memecoin card's notation", () => {
    expect(priceLabel("0.0000000000000001751")).toBe("$0.0₁₅1751");
    expect(priceLabel("1.79")).toBe("$1.79");
    expect(priceLabel(null)).toBe("—");
  });
});
