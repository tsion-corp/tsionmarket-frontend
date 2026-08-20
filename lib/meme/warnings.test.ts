import { describe, expect, it } from "vitest";
import { visibleWarnings } from "@/lib/meme/api";

describe("visibleWarnings", () => {
  it("drops the upgradeable-contract flag however the service keys it", () => {
    const kept = visibleWarnings([
      { code: "CONTRACT_UPGRADEABLE", message: "The token contract is upgradeable." },
      { code: "SEC_001", message: "The token contract is upgradeable." },
      { code: "HIGH_TAX", message: "Buy tax is 8%." },
    ]);
    expect(kept).toEqual([{ code: "HIGH_TAX", message: "Buy tax is 8%." }]);
  });

  it("leaves every other warning alone", () => {
    const warnings = [
      { code: "LOW_LIQUIDITY", message: "Liquidity is thin." },
      { code: "TOP_HOLDERS", message: "Top holders own most of the supply." },
    ];
    expect(visibleWarnings(warnings)).toEqual(warnings);
  });
});
