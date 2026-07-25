import { describe, expect, it } from "vitest";
import {
  apyPercent,
  buildPayOptions,
  buyQuoteRequest,
  clampPage,
  errorCode,
  estimateReceiveTokens,
  estimateReceiveUsdc,
  findRwaHolding,
  formatApy,
  formatCompactUsd,
  gasSymbolForChain,
  gradientFor,
  hasNativeGas,
  isIssuerAccess,
  isRateLimitError,
  isSellableChain,
  isTradable,
  minReceiveTokens,
  pageCount,
  pageSlice,
  priceImpactPercent,
  routeLabel,
  rwaErrorInfo,
  sellQuoteRequest,
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
    network: "base-mainnet",
    address: null,
    decimals: 18,
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

describe("buyQuoteRequest pay token", () => {
  it("defaults to the chain's USDC and sizes at 6 decimals", () => {
    const req = buyQuoteRequest(asset({ chain: "solana", address: "OUT" }), "10", 50);
    expect(req.inputToken).toBe("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    expect(req.amountIn).toBe("10000000");
  });

  it("sizes an arbitrary pay token at its own decimals", () => {
    const req = buyQuoteRequest(asset({ chain: "solana", address: "OUT" }), "1.5", 50, {
      address: "So11111111111111111111111111111111111111112",
      decimals: 9,
    });
    expect(req.inputToken).toBe("So11111111111111111111111111111111111111112");
    expect(req.amountIn).toBe("1500000000");
  });
});

describe("buildPayOptions", () => {
  it("always offers USDC as the default even when not held", () => {
    const opts = buildPayOptions([], asset({ chain: "solana" }));
    expect(opts[0].symbol).toBe("USDC");
    expect(opts[0].balance).toBe(0);
  });

  it("includes held tokens on the asset's chain and keeps USDC first", () => {
    const held = [
      token({
        symbol: "USDT",
        network: "solana-mainnet",
        address: "USDTmint",
        decimals: 6,
        balance: 20,
      }),
      token({
        symbol: "USDC",
        network: "solana-mainnet",
        address: "USDCmint",
        decimals: 6,
        balance: 5,
      }),
    ];
    const opts = buildPayOptions(held, asset({ chain: "solana" }));
    expect(opts[0].symbol).toBe("USDC");
    expect(opts.map((o) => o.symbol)).toContain("USDT");
  });

  it("excludes tokens held on a different chain", () => {
    const held = [
      token({ symbol: "USDC", network: "base-mainnet", address: "baseUsdc", balance: 9 }),
    ];
    const opts = buildPayOptions(held, asset({ chain: "solana" }));
    // Only the synthetic Solana USDC default, not the Base holding.
    expect(opts).toHaveLength(1);
    expect(opts[0].balance).toBe(0);
  });
});

describe("hasNativeGas", () => {
  it("is true when the wallet holds the chain's native token", () => {
    expect(hasNativeGas([token({ symbol: "ETH", balance: 0.1 })], "base")).toBe(true);
    expect(
      hasNativeGas([token({ symbol: "SOL", network: "solana-mainnet", balance: 1 })], "solana")
    ).toBe(true);
  });

  it("is false when a covered network has no native balance", () => {
    expect(hasNativeGas([token({ symbol: "USDC", balance: 500 })], "base")).toBe(false);
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

describe("isRateLimitError", () => {
  it("detects rate limits from the code", () => {
    expect(isRateLimitError("RATE_LIMITED")).toBe(true);
    expect(isRateLimitError("TOO_MANY_REQUESTS")).toBe(true);
    expect(isRateLimitError("429")).toBe(true);
  });

  it("detects rate limits from the message", () => {
    expect(isRateLimitError(undefined, "Too many requests, please try again later")).toBe(true);
    expect(isRateLimitError("UNKNOWN", "rate limit exceeded")).toBe(true);
  });

  it("is false for unrelated errors", () => {
    expect(isRateLimitError("NO_ROUTE")).toBe(false);
    expect(isRateLimitError(undefined, "network down")).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
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

describe("sellQuoteRequest", () => {
  it("sends the RWA and receives the chain's USDC, sized at the asset's decimals", () => {
    const req = sellQuoteRequest(asset({ chain: "base", address: "0xrwa" }), "2.5", 50, 6);
    expect(req).toEqual({
      chain: "base",
      inputToken: "0xrwa",
      outputToken: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      amountIn: "2500000",
      slippageBps: 50,
    });
  });

  it("uses the asset's own decimals, not USDC's", () => {
    // An 18-decimal RWA on Base still pairs to 6-decimal USDC on output.
    const req = sellQuoteRequest(asset({ chain: "base", address: "0xrwa" }), "1", 50, 18);
    expect(req.amountIn).toBe("1000000000000000000");
  });
});

describe("estimateReceiveUsdc", () => {
  it("multiplies token amount by the asset price", () => {
    expect(estimateReceiveUsdc(2, 1.17)).toBeCloseTo(2.34);
  });

  it("returns null for a missing price or non-positive amount", () => {
    expect(estimateReceiveUsdc(2, null)).toBeNull();
    expect(estimateReceiveUsdc(0, 1.17)).toBeNull();
    expect(estimateReceiveUsdc(-1, 1.17)).toBeNull();
  });
});

describe("isSellableChain", () => {
  it("is true only for the indexed chains", () => {
    expect(isSellableChain("base")).toBe(true);
    expect(isSellableChain("arbitrum")).toBe(true);
    expect(isSellableChain("polygon")).toBe(true);
    expect(isSellableChain("solana")).toBe(true);
    expect(isSellableChain("ethereum")).toBe(false);
    expect(isSellableChain("bsc")).toBe(false);
  });
});

describe("findRwaHolding", () => {
  const held = asset({ chain: "base", address: "0xRWA" });

  it("matches the held RWA by chain network and address, case-insensitively", () => {
    const tokens = [
      token({ network: "base-mainnet", address: "0xrwa", symbol: "syrupUSDC", balance: 12 }),
      token({ network: "base-mainnet", address: "0xother", balance: 4 }),
    ];
    expect(findRwaHolding(tokens, held)?.balance).toBe(12);
  });

  it("returns null when the asset isn't held", () => {
    const tokens = [token({ network: "base-mainnet", address: "0xother", balance: 4 })];
    expect(findRwaHolding(tokens, held)).toBeNull();
  });

  it("ignores a same-address token on a different chain", () => {
    const tokens = [token({ network: "arb-mainnet", address: "0xrwa", balance: 9 })];
    expect(findRwaHolding(tokens, held)).toBeNull();
  });

  it("returns null on a chain the portfolio does not index", () => {
    const tokens = [token({ network: "eth-mainnet", address: "0xrwa", balance: 9 })];
    expect(findRwaHolding(tokens, asset({ chain: "ethereum", address: "0xRWA" }))).toBeNull();
  });
});

describe("gradientFor", () => {
  it("is deterministic for the same seed", () => {
    expect(gradientFor("OUSG")).toBe(gradientFor("OUSG"));
    expect(gradientFor("OUSG")).toMatch(/^linear-gradient/);
  });
});
