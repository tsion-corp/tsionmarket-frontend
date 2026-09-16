import { describe, expect, it } from "vitest";
import { isPredictionMarketQuery } from "./query-broadcast";

describe("prediction query broadcast", () => {
  it("shares only the isolated prediction Combo cache", () => {
    expect(isPredictionMarketQuery(["prediction-combo-events", "soccer"])).toBe(true);
    expect(isPredictionMarketQuery(["prediction-combo-team-artwork", ["Arsenal"]])).toBe(true);
    expect(isPredictionMarketQuery(["portfolio", "0x123"])).toBe(false);
    expect(isPredictionMarketQuery(["auth", "session"])).toBe(false);
  });
});
