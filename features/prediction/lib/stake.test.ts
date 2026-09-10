import { describe, expect, it } from "vitest";
import {
  isValidPredictionStake,
  PREDICTION_MIN_STAKE_USD,
  predictionMinimumStakeMessage,
} from "./stake";

describe("prediction market stake", () => {
  it("uses a five dollar minimum", () => {
    expect(PREDICTION_MIN_STAKE_USD).toBe(5);
    expect(isValidPredictionStake(4.99)).toBe(false);
    expect(isValidPredictionStake(5)).toBe(true);
  });

  it("rejects invalid values before execution", () => {
    expect(isValidPredictionStake(0)).toBe(false);
    expect(isValidPredictionStake(Number.NaN)).toBe(false);
    expect(isValidPredictionStake(Number.POSITIVE_INFINITY)).toBe(false);
    expect(predictionMinimumStakeMessage()).toMatch(/\$5\.00 USDC/u);
  });
});
