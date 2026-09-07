import { describe, expect, it } from "vitest";
import { exceedsHeld, maxSellAmount } from "@/lib/meme/sell-amount";

// The portfolio's float balance, rendered with toFixed(18), came out as
// 4230.10614345841349: digits the wallet never held. The trade service
// compared that with the real balance and refused the sale. Max must be the
// exact base-unit balance, and the over-balance check must compare in base
// units too, so a Max amount never reads as over.
describe("maxSellAmount", () => {
  it("is the exact held amount, not a float rendering of it", () => {
    const raw = "4230106143458413489123";
    expect(maxSellAmount(raw, 18)).toBe("4230.106143458413489123");
    expect(Number(maxSellAmount(raw, 18)).toFixed(18)).not.toBe(maxSellAmount(raw, 18));
  });

  it("trims trailing zeros and handles dust", () => {
    expect(maxSellAmount("1000000", 6)).toBe("1");
    expect(maxSellAmount("5", 9)).toBe("0.000000005");
    expect(maxSellAmount("0", 6)).toBe("0");
  });
});

describe("exceedsHeld", () => {
  it("accepts the Max amount and rejects one base unit more", () => {
    const raw = "4230106143458413489123";
    expect(exceedsHeld(maxSellAmount(raw, 18), raw, 18)).toBe(false);
    expect(exceedsHeld("4230.106143458413489124", raw, 18)).toBe(true);
  });

  it("treats an empty or invalid amount as not over", () => {
    expect(exceedsHeld("", "100", 6)).toBe(false);
    expect(exceedsHeld("abc", "100", 6)).toBe(false);
  });
});
