import { describe, expect, it } from "vitest";
import { swapRouteForSymbol, swapRouteSymbols } from "@/lib/spot-swap";

describe("swapRouteForSymbol", () => {
  it("resolves DOGE to the verified cbDOGE route on Base", () => {
    const route = swapRouteForSymbol("DOGE");
    expect(route).toEqual({
      displaySymbol: "DOGE",
      tokenAddress: "0xcbD06E5A2B0C65597161de254AA074E489dEb510",
      decimals: 8,
      chainId: 8453,
    });
  });

  it("is case-insensitive", () => {
    expect(swapRouteForSymbol("doge")).not.toBeNull();
    expect(swapRouteForSymbol("Doge")).not.toBeNull();
  });

  it("returns null for a symbol with no swap route", () => {
    expect(swapRouteForSymbol("ETH")).toBeNull();
    expect(swapRouteForSymbol("NOTREAL")).toBeNull();
  });
});

describe("swapRouteSymbols", () => {
  it("lists every symbol with a swap route", () => {
    expect(swapRouteSymbols()).toEqual(["DOGE"]);
  });
});
