import { describe, expect, it } from "vitest";
import {
  apyPercent,
  buyQuoteRequest,
  clampPage,
  errorCode,
  estimateReceiveTokens,
  formatApy,
  formatCompactUsd,
  gasSymbolForChain,
  gradientFor,
  hasNativeGas,
  isIssuerAccess,
  isTradable,
  minReceiveTokens,
  pageCount,
  pageSlice,
  priceImpactPercent,
  routeLabel,
  rwaErrorInfo,
} from "@/lib/rwa/presenter";
import type { RwaApiAsset, RwaQuote } from "@/lib/rwa-api";
import type { TokenBalance } from "@/hooks/use-portfolio";

function asset(overrides: Partial<RwaApiAsset> = {}): RwaApiAsset {
  return {
    id: "asset-1",
    chain: "ethereum",
    address: "0xabc",
    symbol: "OUSG",
    name: "Short-Term Treasuries",
    issuer: "Ondo",
    category: "Treasuries",
    priceUsd: "108.42",
    freelyTradable: true,
    ...overrides,
  };
}

function token(overrides: Partial<TokenBalance> = {}): TokenBalance {
  return {
    symbol: "ETH",
    name: "Ether",
    network: "eth-mainnet",
    balance: 0.2,
    priceUsd: 3000,
    valueUsd: 600,
    logo: null,
    ...overrides,
  };
}

describe("apyPercent and formatApy", () => {
  it("converts basis points to a percent", () => {
    expect(apyPercent(485)).toBe(4.85);
    expect(formatApy(485)).toBe("4.85%");
  });

  it("returns null for missing or non-positive bps", () => {
    expect(apyPercent(undefined)).toBeNull();
    expect(apyPercent(0)).toBeNull();
    expect(formatApy(undefined)).toBeNull();
  });
});

describe("formatCompactUsd", () => {
  it("formats large values compactly", () => {
    expect(formatCompactUsd("1200000")).toBe("$1.2M");
    expect(formatCompactUsd(2500)).toBe("$2.5K");
  });

  it("returns a dash for missing or non-positive values", () => {
    expect(formatCompactUsd(undefined)).toBe("—");
    expect(formatCompactUsd("0")).toBe("—");
    expect(formatCompactUsd(null)).toBe("—");
  });
});

describe("access classification", () => {
  it("treats freelyTradable dex assets as tradable", () => {
    expect(isTradable(asset({ freelyTradable: true, accessMode: "dex" }))).toBe(true);
    expect(isIssuerAccess(asset({ freelyTradable: true, accessMode: "dex" }))).toBe(false);
  });

  it("treats issuer assets as permissioned", () => {
    expect(isIssuerAccess(asset({ freelyTradable: false }))).toBe(true);
    expect(isIssuerAccess(asset({ accessMode: "issuer" }))).toBe(true);
    expect(isTradable(asset({ accessMode: "issuer", freelyTradable: true }))).toBe(false);
  });
});

describe("hasNativeGas", () => {
  it("is true when the wallet holds the chain's native token", () => {
    expect(hasNativeGas([token({ symbol: "ETH", balance: 0.1 })], "ethereum")).toBe(true);
    expect(
      hasNativeGas([token({ symbol: "SOL", network: "solana-mainnet", balance: 1 })], "solana")
    ).toBe(true);
  });

  it("is false when a covered network has no native balance", () => {
    expect(hasNativeGas([token({ symbol: "USDC", balance: 500 })], "ethereum")).toBe(false);
    expect(hasNativeGas([], "base")).toBe(false);
  });

  it("uses the right native symbol per chain", () => {
    expect(gasSymbolForChain("solana")).toBe("SOL");
    expect(gasSymbolForChain("polygon")).toBe("POL");
    expect(gasSymbolForChain("base")).toBe("ETH");
  });

  it("returns null when the chain is not covered by the portfolio source", () => {
    expect(hasNativeGas([token({ symbol: "BNB", balance: 1 })], "bsc")).toBeNull();
  });
});

describe("rwaErrorInfo", () => {
  it("maps known codes to copy and recovery", () => {
    expect(rwaErrorInfo("NO_ROUTE").message).toBe("No route can fill this trade");
    expect(rwaErrorInfo("INSUFFICIENT_LIQUIDITY").message).toMatch(/liquidity/i);
    expect(rwaErrorInfo("QUOTE_EXPIRED").requote).toBe(true);
    expect(rwaErrorInfo("SIMULATION_FAILED").message).toMatch(/fail on-chain/i);
    expect(rwaErrorInfo("ASSET_NOT_TRADABLE").message).toMatch(/issuer/i);
    expect(rwaErrorInfo("SERVICE_UNAVAILABLE").retryable).toBe(true);
  });

  it("falls back for unknown codes", () => {
    expect(rwaErrorInfo(undefined, "boom").message).toBe("boom");
    expect(rwaErrorInfo("WHATEVER").message).toMatch(/went wrong/i);
  });
});

describe("errorCode", () => {
  it("reads a string code from a thrown error", () => {
    const e = Object.assign(new Error("x"), { code: "NO_ROUTE" });
    expect(errorCode(e)).toBe("NO_ROUTE");
  });

  it("returns undefined when there is no code", () => {
    expect(errorCode(new Error("x"))).toBeUndefined();
    expect(errorCode(null)).toBeUndefined();
  });
});

describe("pagination", () => {
  it("counts pages and slices per page", () => {
    expect(pageCount(9, 9)).toBe(1);
    expect(pageCount(10, 9)).toBe(2);
    expect(pageCount(0, 9)).toBe(1);
    expect(pageSlice([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
  });

  it("clamps a page into range", () => {
    expect(clampPage(5, 10, 9)).toBe(2);
    expect(clampPage(0, 10, 9)).toBe(1);
    expect(clampPage(1, 0, 9)).toBe(1);
  });
});

describe("quote preview math", () => {
  it("estimates receive tokens from a USD spend", () => {
    expect(estimateReceiveTokens(500, 100)).toBe(5);
    expect(estimateReceiveTokens(500, null)).toBeNull();
    expect(estimateReceiveTokens(0, 100)).toBeNull();
  });

  it("derives min received from the amountMin ratio without decimals", () => {
    const quote: RwaQuote = {
      provider: "jupiter",
      input: { chain: "solana", address: "usdc", amount: "500000000" },
      output: { chain: "solana", address: "asset", amount: "1000", amountMin: "990" },
      priceImpactBps: 12,
    };
    expect(minReceiveTokens(5, quote)).toBeCloseTo(4.95, 10);
    expect(minReceiveTokens(null, quote)).toBeNull();
    expect(minReceiveTokens(5, null)).toBeNull();
  });

  it("converts price impact and labels the route", () => {
    const quote: RwaQuote = {
      provider: "jupiter",
      input: { chain: "solana", address: "usdc", amount: "1" },
      output: { chain: "solana", address: "asset", amount: "1" },
      priceImpactBps: 25,
      route: [
        { venue: "Orca", portionBps: 6000 },
        { venue: "Raydium", portionBps: 4000 },
      ],
    };
    expect(priceImpactPercent(25)).toBe(0.25);
    expect(priceImpactPercent(null)).toBeNull();
    expect(routeLabel(quote)).toBe("Orca + Raydium");
    expect(routeLabel(null)).toBe("—");
  });
});

describe("buyQuoteRequest", () => {
  it("pays USDC and receives the asset, scaled at 6 decimals off BSC", () => {
    const req = buyQuoteRequest(asset({ chain: "base", address: "0xasset" }), "500", 50);
    expect(req).toEqual({
      chain: "base",
      inputToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      outputToken: "0xasset",
      amountIn: "500000000",
      slippageBps: 50,
    });
  });

  it("scales USDC at 18 decimals on BSC", () => {
    const req = buyQuoteRequest(asset({ chain: "bsc", address: "0xasset" }), "1", 50);
    expect(req.amountIn).toBe("1000000000000000000");
    expect(req.inputToken).toBe("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d");
  });
});

describe("gradientFor", () => {
  it("is deterministic for the same seed", () => {
    expect(gradientFor("OUSG")).toBe(gradientFor("OUSG"));
    expect(gradientFor("OUSG")).toMatch(/^linear-gradient/);
  });
});
