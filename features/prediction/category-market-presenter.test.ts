import { describe, expect, it } from "vitest";
import { isHouseEligibleOdds } from "./category-market-presenter";

describe("house prediction odds eligibility", () => {
  it("accepts a market when either side is no higher than 1.08", () => {
    expect(isHouseEligibleOdds(20, 1.08)).toBe(true);
    expect(isHouseEligibleOdds(1, 2_000)).toBe(true);
  });

  it("rejects markets whose shortest side is above 1.08", () => {
    expect(isHouseEligibleOdds(6.92, 1.17)).toBe(false);
    expect(isHouseEligibleOdds(3.39, 1.42)).toBe(false);
    expect(isHouseEligibleOdds(4.06, 1.33)).toBe(false);
    expect(isHouseEligibleOdds(12.35, 1.081)).toBe(false);
  });
});
