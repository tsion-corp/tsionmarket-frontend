import { describe, expect, it } from "vitest";
import { classifySellQuoteFailure, SellQuoteError, shouldFallbackFromSellQuote } from "@/lib/sell";

describe("classifySellQuoteFailure", () => {
  it("recognizes provider wording that is safe to route through LI.FI", () => {
    expect(classifySellQuoteFailure("Amount must be at least 2 USD")).toBe("minimum");
    expect(classifySellQuoteFailure("No routes found for this request")).toBe("no-route");
    expect(classifySellQuoteFailure("Origin asset is not supported")).toBe("no-route");
  });

  it("keeps infrastructure failures on the primary provider", () => {
    expect(classifySellQuoteFailure("Service temporarily unavailable")).toBe("provider");
  });
});

describe("shouldFallbackFromSellQuote", () => {
  it("allows Solana fallback for an explicit minimum or no-route response", () => {
    expect(shouldFallbackFromSellQuote(new SellQuoteError(422, "minimum", "too low"))).toBe(true);
    expect(shouldFallbackFromSellQuote(new SellQuoteError(422, "no-route", "no route"))).toBe(true);
  });

  it("does not hide provider, auth, or server failures behind LI.FI", () => {
    expect(shouldFallbackFromSellQuote(new SellQuoteError(503, "provider", "offline"))).toBe(false);
    expect(shouldFallbackFromSellQuote(new Error("unknown"))).toBe(false);
  });
});
