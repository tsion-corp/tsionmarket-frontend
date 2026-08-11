import { describe, expect, it } from "vitest";
import { isValidTradeAmount, newIdempotencyKey } from "@/lib/meme/api";

describe("newIdempotencyKey", () => {
  it("returns a v4 UUID", () => {
    expect(newIdempotencyKey()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("never repeats across calls", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe("isValidTradeAmount", () => {
  it("accepts plain decimals within the token's precision", () => {
    expect(isValidTradeAmount("12", 6)).toBe(true);
    expect(isValidTradeAmount("12.5", 6)).toBe(true);
    expect(isValidTradeAmount("0.000001", 6)).toBe(true);
  });

  it("rejects zero, signs, exponents and excess precision", () => {
    expect(isValidTradeAmount("0", 6)).toBe(false);
    expect(isValidTradeAmount("-1", 6)).toBe(false);
    expect(isValidTradeAmount("1e3", 6)).toBe(false);
    expect(isValidTradeAmount("1,000", 6)).toBe(false);
    expect(isValidTradeAmount("0.0000001", 6)).toBe(false);
    expect(isValidTradeAmount("", 6)).toBe(false);
  });
});
