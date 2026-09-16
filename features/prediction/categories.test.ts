import { describe, expect, it } from "vitest";
import {
  parsePredictionCategory,
  predictionCategoryAvailable,
  predictionCategoryHref,
} from "@/features/prediction/categories";

describe("prediction categories", () => {
  it("keeps Sports as the default category", () => {
    expect(parsePredictionCategory(undefined)).toBe("sports");
    expect(parsePredictionCategory("unknown")).toBe("sports");
    expect(predictionCategoryHref("sports")).toBe(
      "/prediction/markets?sport=football&state=prematch"
    );
  });

  it("routes every non-sports category to its market feed", () => {
    expect(parsePredictionCategory("trending")).toBe("trending");
    expect(predictionCategoryHref("trending")).toBe("/prediction/markets?category=trending");
    expect(parsePredictionCategory("politics")).toBe("politics");
    expect(predictionCategoryHref("politics")).toBe("/prediction/markets?category=politics");
    expect(predictionCategoryAvailable("politics")).toBe(true);
    expect(predictionCategoryAvailable("crypto")).toBe(true);
    expect(predictionCategoryAvailable("finance")).toBe(true);
    expect(predictionCategoryAvailable("tech")).toBe(true);
    expect(predictionCategoryAvailable("culture")).toBe(true);
    expect(predictionCategoryAvailable("economy")).toBe(true);
  });
});
