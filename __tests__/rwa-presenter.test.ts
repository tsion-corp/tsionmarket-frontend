import { describe, expect, it } from "vitest";
import {
  apyPercent,
  buildPayOptions,
  buyQuoteRequest,
  clampPage,
  errorCode,
  estimateReceiveTokens,
  estimateReceiveUsdc,
  exceedsBalance,
  findRwaAsset,
  findRwaHolding,
  formatApy,
  formatCompactUsd,
  gasSymbolForChain,
  gradientFor,
  hasNativeGas,
  requiresNativeGas,
  isIssuerAccess,
  isRateLimitError,
  isSellableChain,
  isLiveChain,
  isTradable,
  isTransientRwaError,
  minReceiveTokens,
  networkToRwaChain,
  pageCount,
  pageSlice,
  pctOfRawBalance,
  priceImpactPercent,
  quoteReceiveTokens,
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
    kind: "coin",
    balance: 0.2,
    rawBalance: "200000000000000000",
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

  it("trades on the live chains only", () => {
    expect(isLiveChain(asset({ chain: "base" }))).toBe(true);
    expect(isLiveChain(asset({ chain: "solana" }))).toBe(true);
    expect(isLiveChain(asset({ chain: "ethereum" }))).toBe(false);
    expect(isLiveChain(asset({ chain: "bsc" }))).toBe(false);
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

  it("never requires native gas on Base, where sends are sponsored", () => {
    expect(requiresNativeGas("base")).toBe(false);
    expect(requiresNativeGas("solana")).toBe(true);
    expect(requiresNativeGas("polygon")).toBe(true);
    expect(requiresNativeGas("arbitrum")).toBe(true);
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

describe("isTransientRwaError", () => {
  it("treats rate limits and upstream blips as transient", () => {
    expect(isTransientRwaError("RATE_LIMITED")).toBe(true);
    expect(isTransientRwaError("SERVICE_UNAVAILABLE")).toBe(true);
    expect(isTransientRwaError("502")).toBe(true);
  });

  it("treats a bare network failure as transient", () => {
    expect(isTransientRwaError(undefined, "Failed to fetch")).toBe(true);
    expect(isTransientRwaError(undefined, "network error")).toBe(true);
  });

  it("does not retry deterministic errors", () => {
    expect(isTransientRwaError("NO_ROUTE")).toBe(false);
    expect(isTransientRwaError("INSUFFICIENT_LIQUIDITY")).toBe(false);
    expect(isTransientRwaError("SIMULATION_FAILED")).toBe(false);
    expect(isTransientRwaError("VALIDATION_ERROR", "bad input")).toBe(false);
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

describe("networkToRwaChain", () => {
  it("maps the Alchemy network id back to the RWA chain", () => {
    expect(networkToRwaChain("base-mainnet")).toBe("base");
    expect(networkToRwaChain("polygon-mainnet")).toBe("polygon");
    expect(networkToRwaChain("arb-mainnet")).toBe("arbitrum");
    expect(networkToRwaChain("solana-mainnet")).toBe("solana");
  });

  it("returns null for an unknown network", () => {
    expect(networkToRwaChain("zksync-mainnet")).toBeNull();
  });
});

describe("findRwaAsset", () => {
  const assets = [
    asset({ id: "base:0xRWA", chain: "base", address: "0xRWA", symbol: "syrupUSDC" }),
    asset({ id: "polygon:0xPOL", chain: "polygon", address: "0xPOL", symbol: "USDY" }),
  ];

  it("resolves a held RWA by network and address, case-insensitively", () => {
    expect(findRwaAsset(assets, "base-mainnet", "0xrwa")?.symbol).toBe("syrupUSDC");
  });

  it("returns null when the address isn't in the registry", () => {
    expect(findRwaAsset(assets, "base-mainnet", "0xother")).toBeNull();
  });

  it("returns null for a native balance (no address) or an untracked network", () => {
    expect(findRwaAsset(assets, "base-mainnet", null)).toBeNull();
    expect(findRwaAsset(assets, "zksync-mainnet", "0xRWA")).toBeNull();
  });

  it("does not match the right address on the wrong chain", () => {
    expect(findRwaAsset(assets, "polygon-mainnet", "0xRWA")).toBeNull();
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

describe("pctOfRawBalance", () => {
  it("returns the exact balance for 100 percent", () => {
    // A float round-trip of this value would not survive; the bigint path must.
    expect(pctOfRawBalance("123456789012345678", 18, 100)).toBe("0.123456789012345678");
  });

  it("takes the percent in base units, flooring the remainder", () => {
    expect(pctOfRawBalance("1000001", 6, 50)).toBe("0.5");
    expect(pctOfRawBalance("3", 6, 50)).toBe("0.000001");
  });

  it("never emits exponent notation for tiny balances", () => {
    expect(pctOfRawBalance("1", 18, 100)).toBe("0.000000000000000001");
  });

  it("is null for a zero slice or bad input", () => {
    expect(pctOfRawBalance("1", 6, 25)).toBeNull();
    expect(pctOfRawBalance("0", 6, 100)).toBeNull();
    expect(pctOfRawBalance("1.5", 6, 100)).toBeNull();
    expect(pctOfRawBalance("abc", 6, 100)).toBeNull();
    expect(pctOfRawBalance("100", 6, 0)).toBeNull();
    expect(pctOfRawBalance("100", 6, 101)).toBeNull();
  });
});

describe("exceedsBalance", () => {
  it("compares the typed amount against the balance in base units", () => {
    expect(exceedsBalance("1.000001", "1000000", 6)).toBe(true);
    expect(exceedsBalance("1", "1000000", 6)).toBe(false);
    expect(exceedsBalance("0.999999", "1000000", 6)).toBe(false);
  });

  it("never flags a Max amount staged from the same balance", () => {
    const raw = "123456789012345678";
    const max = pctOfRawBalance(raw, 18, 100);
    expect(max).not.toBeNull();
    expect(exceedsBalance(max as string, raw, 18)).toBe(false);
  });

  it("does not gate on an unusable balance string", () => {
    expect(exceedsBalance("5", "n/a", 6)).toBe(false);
  });
});

describe("quoteReceiveTokens", () => {
  const quote = (amount: string): RwaQuote => ({
    provider: "jupiter",
    input: { chain: "solana", address: "usdc", amount: "500000000" },
    output: { chain: "solana", address: "asset", amount },
    priceImpactBps: 12,
  });

  it("converts the quote output at the known decimals", () => {
    expect(quoteReceiveTokens(quote("2500000"), 6)).toBe(2.5);
    expect(quoteReceiveTokens(quote("1000000000000000000"), 18)).toBe(1);
  });

  it("is null without a quote or known decimals, so the preview falls back", () => {
    expect(quoteReceiveTokens(null, 6)).toBeNull();
    expect(quoteReceiveTokens(quote("2500000"), null)).toBeNull();
  });

  it("is null for a non-integer or non-positive output amount", () => {
    expect(quoteReceiveTokens(quote("2.5"), 6)).toBeNull();
    expect(quoteReceiveTokens(quote("0"), 6)).toBeNull();
  });
});
