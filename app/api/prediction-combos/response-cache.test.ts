import { afterEach, describe, expect, it } from "vitest";
import {
  clearPredictionResponseCache,
  predictionCachePolicy,
  readPredictionResponseCache,
  writePredictionResponseCache,
} from "./response-cache";

describe("prediction response cache", () => {
  afterEach(clearPredictionResponseCache);

  it("returns successful responses inside the requested age", () => {
    writePredictionResponseCache("soccer", { success: true }, 200, 1_000);

    expect(readPredictionResponseCache("soccer", 15_000, 10_000)).toEqual({
      body: { success: true },
      status: 200,
      storedAt: 1_000,
    });
  });

  it("does not return responses older than the requested age", () => {
    writePredictionResponseCache("soccer", { success: true }, 200, 1_000);

    expect(readPredictionResponseCache("soccer", 5_000, 10_000)).toBeNull();
  });

  it("keeps metadata longer than live event prices", () => {
    expect(predictionCachePolicy("sports/teams")).toEqual({
      freshMs: 300_000,
      staleMs: 86_400_000,
    });
    expect(predictionCachePolicy("sports/filters")).toEqual({
      freshMs: 300_000,
      staleMs: 86_400_000,
    });
    expect(predictionCachePolicy("sports/combo-events")).toEqual({
      freshMs: 15_000,
      staleMs: 300_000,
    });
    expect(predictionCachePolicy("sports/combo-events/845463")).toEqual({
      freshMs: 5_000,
      staleMs: 60_000,
    });
    expect(predictionCachePolicy("sports/events")).toEqual({
      freshMs: 15_000,
      staleMs: 300_000,
    });
    expect(predictionCachePolicy("sports/events/845463")).toEqual({
      freshMs: 5_000,
      staleMs: 60_000,
    });
    expect(predictionCachePolicy("markets/events")).toEqual({
      freshMs: 30_000,
      staleMs: 600_000,
    });
    expect(predictionCachePolicy("markets/events/481717")).toEqual({
      freshMs: 15_000,
      staleMs: 300_000,
    });
  });
});
