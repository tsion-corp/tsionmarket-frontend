import { describe, expect, it } from "vitest";
import { checkUpstream } from "@/lib/server/validate-upstream";
import { swapQuoteSchema, tradeSchemaFor } from "@/lib/api/schemas/trade";
import {
  ACTIVITY_PAGE,
  LIVE_LIST_TOKEN,
  LIVE_RISK,
  LIVE_SEARCH_ROW,
  LIVE_SOLANA_MARKET,
  LIVE_TOKEN_DETAIL,
  LIVE_TOKEN_PAGE,
  LIVE_TRADABILITY,
  LIVE_TRENDING_PAGE,
  PORTFOLIO_PAGE,
  PORTFOLIO_POSITION_DETAIL,
  PORTFOLIO_SUMMARY,
  SOLANA_SUBMISSION,
  SOLANA_SWAP_QUOTE,
  SUBMISSION,
  SWAP_DETAIL,
  SWAP_PAGE,
  SWAP_PREVIEW,
  SWAP_QUOTE,
  SWAP_STATUS,
  WALLET_CHALLENGE,
  WALLET_VERIFIED,
} from "@/lib/api/schemas/trade.fixtures";

const ok = (data: unknown) => ({ success: true, data });
// A copy of a sample with some fields removed, for a body that lost them.
function omit(sample: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(sample).filter(([key]) => !keys.includes(key)));
}

const check = (path: string, data: unknown) =>
  checkUpstream(tradeSchemaFor(path), ok(data), { service: "trade", path });

const SOL_MINT = "x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp";

// Every route the relay forwards, with a sample in the shape the service
// answers. A route missing here is a route whose drift reaches a component.
const FORWARDED: [string, unknown][] = [
  ["tokens", LIVE_TOKEN_PAGE],
  ["tokens/trending", LIVE_TRENDING_PAGE],
  ["tokens/search", [LIVE_SEARCH_ROW]],
  [`tokens/${SOL_MINT}`, LIVE_TOKEN_DETAIL],
  [`tokens/${SOL_MINT}/market`, LIVE_SOLANA_MARKET],
  [`tokens/${SOL_MINT}/risk`, LIVE_RISK],
  [`tokens/${SOL_MINT}/tradability`, LIVE_TRADABILITY],
  ["swaps/preview", SWAP_PREVIEW],
  ["solana/swaps/preview", SWAP_PREVIEW],
  ["swaps/quote", SWAP_QUOTE],
  ["solana/swaps/quote", SOLANA_SWAP_QUOTE],
  ["swaps", SWAP_PAGE],
  ["swaps/swap-1", SWAP_DETAIL],
  ["swaps/swap-1/status", SWAP_STATUS],
  ["swaps/swap-1/submissions", SUBMISSION],
  ["solana/swaps/swap-sol-1/submissions", SOLANA_SUBMISSION],
  ["wallets/challenges", WALLET_CHALLENGE],
  ["wallets/verify", WALLET_VERIFIED],
  ["solana/wallets/challenges", WALLET_CHALLENGE],
  ["solana/wallets/verify", WALLET_VERIFIED],
  ["portfolio", PORTFOLIO_PAGE],
  ["portfolio/summary", PORTFOLIO_SUMMARY],
  [`portfolio/solana/${SOL_MINT}`, PORTFOLIO_POSITION_DETAIL],
  ["activity", ACTIVITY_PAGE],
];

describe("every forwarded trade route has a schema", () => {
  it.each(FORWARDED)("%s has one and accepts the service's shape", (path, sample) => {
    expect(tradeSchemaFor(path), path).not.toBeNull();
    const result = check(path, sample);
    expect(result.problem).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  // The verify routes pin only "an object came back": the contract names no
  // response fields and the client reads none. Every other route has fields
  // an unrelated object lacks.
  const OBJECT_ONLY = new Set(["wallets/verify", "solana/wallets/verify"]);

  it.each(FORWARDED)("%s rejects a body that is not its shape", (path) => {
    const malformed = OBJECT_ONLY.has(path) ? "verified" : { unexpected: true };
    expect(check(path, malformed).ok).toBe(false);
  });

  it("ignores the query string when matching a path", () => {
    expect(tradeSchemaFor("tokens?page=1&limit=20")).toBe(tradeSchemaFor("tokens"));
    expect(tradeSchemaFor(`tokens/${SOL_MINT}?chain=solana`)).toBe(tradeSchemaFor(`tokens/abc`));
  });

  it("has no schema for a path outside the contract", () => {
    expect(tradeSchemaFor("gas-sponsor/capabilities")).toBeNull();
    expect(tradeSchemaFor("swaps/a/b/c")).toBeNull();
  });
});

// Ids sit in the same segment a literal route uses, so a template must never
// swallow a literal: trending is not a token called "trending", and a preview
// is not a swap called "preview".
describe("path templates with ids", () => {
  it("picks the status schema for a swap id's status", () => {
    const status = tradeSchemaFor("swaps/abc/status");
    expect(status).not.toBeNull();
    expect(status).not.toBe(tradeSchemaFor("swaps/abc"));
    expect(check("swaps/abc/status", SWAP_STATUS).ok).toBe(true);
    expect(check("swaps/abc/status", SWAP_DETAIL).ok).toBe(false);
  });

  it("keeps literal token routes off the detail template", () => {
    expect(tradeSchemaFor("tokens/trending")).not.toBe(tradeSchemaFor("tokens/0xabc"));
    expect(tradeSchemaFor("tokens/search")).not.toBe(tradeSchemaFor("tokens/0xabc"));
    expect(check("tokens/trending", LIVE_TRENDING_PAGE).ok).toBe(true);
  });

  it("keeps preview and quote off the swap-detail template", () => {
    expect(check("swaps/preview", SWAP_PREVIEW).ok).toBe(true);
    expect(check("swaps/quote", SWAP_QUOTE).ok).toBe(true);
    expect(check("swaps/preview", SWAP_DETAIL).ok).toBe(false);
  });

  it("keeps the portfolio summary off the position template", () => {
    expect(tradeSchemaFor("portfolio/summary")).not.toBe(tradeSchemaFor("portfolio/base/0xabc"));
  });
});

describe("token lists", () => {
  it("accepts a token with no market data yet", () => {
    const cold = {
      ...LIVE_LIST_TOKEN,
      logoUrl: null,
      priceUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      priceChange24hPercent: null,
      marketCapUsd: null,
      fdvUsd: null,
    };
    expect(check("tokens", { items: [cold], meta: LIVE_TOKEN_PAGE.meta }).ok).toBe(true);
  });

  // The live search route omits riskLevel, warnings, buyEnabled, sellEnabled
  // and status; the client fills them (withRiskDefaults).
  it("accepts the live search shape, which carries no risk block", () => {
    expect(check("tokens/search", [LIVE_SEARCH_ROW]).ok).toBe(true);
  });

  it("rejects the wrapped shape on search, which would mean the API changed", () => {
    expect(check("tokens/search", LIVE_TOKEN_PAGE).ok).toBe(false);
  });

  it("rejects a list without meta", () => {
    expect(check("tokens", { items: LIVE_TOKEN_PAGE.items }).ok).toBe(false);
    expect(check("tokens/trending", { items: LIVE_TRENDING_PAGE.items }).ok).toBe(false);
    expect(check("swaps", { items: SWAP_PAGE.items }).ok).toBe(false);
    expect(check("portfolio", { items: PORTFOLIO_PAGE.items }).ok).toBe(false);
    expect(check("activity", { items: ACTIVITY_PAGE.items }).ok).toBe(false);
  });

  it("rejects a risk level outside the contract's five", () => {
    const row = { ...LIVE_LIST_TOKEN, riskLevel: "SAFE" };
    expect(check("tokens", { ...LIVE_TOKEN_PAGE, items: [row] }).ok).toBe(false);
  });

  it("rejects a warning that is not { code, message }", () => {
    const row = { ...LIVE_LIST_TOKEN, warnings: ["LOW_LIQUIDITY"] };
    expect(check("tokens", { ...LIVE_TOKEN_PAGE, items: [row] }).ok).toBe(false);
  });

  it("accepts the three lifecycle states and rejects anything else", () => {
    for (const status of ["ACTIVE", "BLOCKED", "DISCOVERED"]) {
      const row = { ...LIVE_LIST_TOKEN, status };
      expect(check("tokens", { ...LIVE_TOKEN_PAGE, items: [row] }).ok, status).toBe(true);
    }
    const row = { ...LIVE_LIST_TOKEN, status: "PAUSED" };
    expect(check("tokens", { ...LIVE_TOKEN_PAGE, items: [row] }).ok).toBe(false);
  });
});

describe("token detail", () => {
  // The detail route is what the trade surface re-reads for fresh risk, so it
  // must carry the risk block; the list routes may not.
  it("requires the risk block on the detail route", () => {
    expect(check(`tokens/${SOL_MINT}`, omit(LIVE_TOKEN_DETAIL, "riskLevel")).ok).toBe(false);
  });

  it("accepts the Solana market read without name, symbol or logo", () => {
    expect(check(`tokens/${SOL_MINT}/market`, LIVE_SOLANA_MARKET).ok).toBe(true);
  });

  it("rejects a tradability answer without its risk assessment", () => {
    expect(
      check(`tokens/${SOL_MINT}/tradability`, { buyEnabled: true, sellEnabled: true }).ok
    ).toBe(false);
  });
});

describe("swap quote schema", () => {
  it("requires the calls the wallet will sign", () => {
    const result = checkUpstream(swapQuoteSchema, ok(omit(SWAP_QUOTE, "calls")), {
      service: "trade",
      path: "swaps/quote",
    });
    expect(result.ok).toBe(false);
    expect(result.problem).toContain("calls");
  });

  it("requires the expiry the client refuses to execute past", () => {
    expect(check("swaps/quote", omit(SWAP_QUOTE, "expiresAt")).ok).toBe(false);
  });
});

// A Solana quote is one transaction, not a list of calls, so it needs its
// own shape; matching it against the Base schema would 502 every trade.
describe("solana swap quote schema", () => {
  it("rejects a Solana quote with no transaction to sign", () => {
    expect(check("solana/swaps/quote", { swapId: "s1", expiresAt: "x" }).ok).toBe(false);
  });

  it("does not apply the Base call-list schema to the Solana route", () => {
    expect(check("solana/swaps/quote", SWAP_QUOTE).ok).toBe(false);
  });
});

describe("portfolio valuation nulls", () => {
  it("accepts a position the providers cannot value", () => {
    expect(check("portfolio", PORTFOLIO_PAGE).ok).toBe(true);
  });

  it("rejects a quantity sent as a number rather than a decimal string", () => {
    const row = { ...PORTFOLIO_PAGE.items[0], quantityRemaining: 4 };
    expect(check("portfolio", { ...PORTFOLIO_PAGE, items: [row] }).ok).toBe(false);
  });
});

// The screener's per-window activity and the pair's creation time ride on the
// list and trending rows (ADR-2026-09-15-meme-trending-screener). Both are
// optional, so a row from before the screener, and every search row, still
// passes.
describe("token list activity", () => {
  const withActivity = (activity: unknown, extra: Record<string, unknown> = {}) => ({
    ...LIVE_TOKEN_PAGE,
    items: [{ ...LIVE_LIST_TOKEN, activity, ...extra }],
  });

  it("accepts a row without activity or pairCreatedAt on both list routes", () => {
    expect(check("tokens", LIVE_TOKEN_PAGE).ok).toBe(true);
    expect(check("tokens/trending", LIVE_TRENDING_PAGE).ok).toBe(true);
  });

  it("accepts a full set of windows and a pair creation time", () => {
    const window = {
      volumeUsd: "1200.5",
      transactions: 40,
      traders: 12,
      priceChangePercent: "3.2",
    };
    const body = withActivity(
      { "5m": window, "1h": window, "6h": window, "12h": window, "24h": window },
      { pairCreatedAt: "2026-09-15T08:00:00.000Z" }
    );
    expect(check("tokens", body).ok).toBe(true);
    expect(check("tokens/trending", body).ok).toBe(true);
  });

  it("accepts a partial record, sparse windows and null fields", () => {
    const body = withActivity(
      { "1h": { volumeUsd: null, transactions: null }, "24h": {} },
      { pairCreatedAt: null }
    );
    expect(check("tokens", body).ok).toBe(true);
  });

  it("accepts a window the providers left out entirely as null", () => {
    expect(check("tokens", withActivity({ "6h": null, "24h": { traders: 3 } })).ok).toBe(true);
  });

  it("does not fail on a window this client does not know", () => {
    expect(check("tokens", withActivity({ "4h": { traders: 3 }, "1h": { traders: 1 } })).ok).toBe(
      true
    );
  });

  it("accepts negative changes and float artifacts as decimal strings", () => {
    for (const priceChangePercent of ["-4.5", "12.340000000000002", "-100", "0"]) {
      const body = withActivity({ "5m": { priceChangePercent } });
      expect(check("tokens", body).ok, priceChangePercent).toBe(true);
    }
  });

  it("rejects a change sent as a number rather than a decimal string", () => {
    expect(check("tokens", withActivity({ "5m": { priceChangePercent: 4.5 } })).ok).toBe(false);
  });

  // The catalogue listed fine before these fields were read, so a provider's
  // odd count must not turn the whole list into a 502. Any number passes the
  // boundary; the parser reads one that is not a whole count as unavailable.
  it("accepts any numeric count, and rejects a count sent as text", () => {
    expect(check("tokens", withActivity({ "5m": { transactions: 1.5 } })).ok).toBe(true);
    expect(check("tokens", withActivity({ "5m": { traders: -1 } })).ok).toBe(true);
    expect(check("tokens", withActivity({ "5m": { traders: "3" } })).ok).toBe(false);
  });
});
