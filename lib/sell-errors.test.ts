import { describe, expect, it } from "vitest";
import { classifySellQuoteFailure } from "@/lib/sell";

describe("classifySellQuoteFailure", () => {
  it("recognizes minimum and no-route provider responses", () => {
    expect(classifySellQuoteFailure("Amount must be at least 2 USD")).toBe("minimum");
    expect(classifySellQuoteFailure("No routes found for this request")).toBe("no-route");
    expect(classifySellQuoteFailure("Origin asset is not supported")).toBe("no-route");
  });

  it("keeps infrastructure failures on the primary provider", () => {
    expect(classifySellQuoteFailure("Service temporarily unavailable")).toBe("provider");
  });
});
