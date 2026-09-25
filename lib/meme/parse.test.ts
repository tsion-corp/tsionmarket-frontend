import { describe, expect, it } from "vitest";
import {
  TradeShapeError,
  parseSolanaSwapQuote,
  parseSubmission,
  parseSwapPage,
  parseSwapPreview,
  parseSwapQuote,
  parseSwapStatus,
  parseTokenPage,
  parseTokenSearch,
  parseTokenView,
  parseTradability,
  parseWalletChallenge,
} from "@/lib/meme/parse";
import {
  LIVE_LIST_TOKEN,
  LIVE_SEARCH_ROW,
  LIVE_TOKEN_DETAIL,
  LIVE_TOKEN_PAGE,
  LIVE_TRADABILITY,
  LIVE_TRENDING_PAGE,
  SOLANA_SWAP_QUOTE,
  SUBMISSION,
  SWAP_PAGE,
  SWAP_PREVIEW,
  SWAP_QUOTE,
  SWAP_STATUS,
  WALLET_CHALLENGE,
} from "@/lib/api/schemas/trade.fixtures";

// The mappers are the one place raw trade-service JSON becomes this app's
// types: a component downstream only ever holds what they return.

describe("parseTokenPage", () => {
  it("maps a live catalog page and keeps the server's meta", () => {
    const page = parseTokenPage(LIVE_TOKEN_PAGE);
    expect(page.meta).toEqual({ page: 1, limit: 2, total: 105200 });
    expect(page.items[1]).toMatchObject({
      chainId: 8453,
      address: "0x4cd9a847f39106e19a4e41aea8a232e915c82af5",
      riskLevel: "LOW",
      status: "ACTIVE",
      warnings: [],
    });
    expect(page.items[0].warnings[0].code).toBe("LOW_LIQUIDITY");
  });

  it("does not carry fields the contract does not define", () => {
    const page = parseTokenPage({
      ...LIVE_TOKEN_PAGE,
      items: [{ ...LIVE_TOKEN_PAGE.items[0], chain: "solana", internalScore: 9 }],
    });
    expect(page.items[0]).not.toHaveProperty("internalScore");
  });

  it("throws a shape error for a page without meta", () => {
    expect(() => parseTokenPage({ items: LIVE_TOKEN_PAGE.items })).toThrow(TradeShapeError);
  });
});

describe("parseTokenSearch", () => {
  // The live search route omits the risk block. The row must still render:
  // unrated, no warnings, tradability left to the server's quote check.
  it("fills the risk block the live search route omits", () => {
    const [row] = parseTokenSearch([LIVE_SEARCH_ROW]);
    expect(row.riskLevel).toBe("UNKNOWN");
    expect(row.warnings).toEqual([]);
    expect(row.buyEnabled).toBe(true);
    expect(row.sellEnabled).toBe(true);
    expect(row.status).toBeUndefined();
  });

  it("keeps a null market field null, never zero", () => {
    const [row] = parseTokenSearch([LIVE_SEARCH_ROW]);
    expect(row.priceChange24hPercent).toBeNull();
    expect(row.decimals).toBeNull();
    expect(row.logoUrl).toBeNull();
  });

  it("reads an absent market field as unavailable", () => {
    const sparse = Object.fromEntries(
      Object.entries(LIVE_SEARCH_ROW).filter(([k]) => k !== "volume24hUsd" && k !== "marketCapUsd")
    );
    const [row] = parseTokenSearch([sparse]);
    expect(row.volume24hUsd).toBeNull();
    expect(row.marketCapUsd).toBeNull();
  });
});

describe("parseTokenView", () => {
  it("maps the detail route, case-sensitive Solana address included", () => {
    const token = parseTokenView(LIVE_TOKEN_DETAIL);
    expect(token.address).toBe("x95HN3DWvbfCBtTjGm587z8suK3ec6cwQwgZNLbWKyp");
    expect(token.riskLevel).toBe("HIGH");
    expect(token.liquidityUsd).toBe("57318");
  });

  it("throws a shape error when the risk level is not one of the five", () => {
    expect(() => parseTokenView({ ...LIVE_TOKEN_DETAIL, riskLevel: "SAFE" })).toThrow(
      TradeShapeError
    );
  });
});

describe("parseTradability", () => {
  it("keeps the service's risk assessment beside the two switches", () => {
    const tradability = parseTradability(LIVE_TRADABILITY);
    expect(tradability.buyEnabled).toBe(true);
    expect(tradability.risk.level).toBe("HIGH");
    expect(tradability.risk.disclaimer).toContain("No automated check");
  });
});

describe("swap mappers", () => {
  it("maps a preview, fee and expiry included", () => {
    const preview = parseSwapPreview(SWAP_PREVIEW);
    expect(preview.platformFeeAmountFormatted).toBe("0.025");
    expect(preview.expiresAt).toBe(SWAP_PREVIEW.expiresAt);
    expect(preview.buyToken.symbol).toBe("MENTE");
    expect(preview.priceImpactBps).toBe(12);
  });

  it("maps a Base quote with its ordered calls", () => {
    const quote = parseSwapQuote(SWAP_QUOTE);
    expect(quote.calls.map((c) => c.to)).toEqual(["0xusdc", "0xrouter"]);
    expect(quote.calls[0].value).toBe("0");
    expect(quote.chainId).toBe(8453);
  });

  it("defaults a call's value to zero only where the contract omits it", () => {
    const quote = parseSwapQuote({
      ...SWAP_QUOTE,
      calls: [{ to: "0xrouter", data: "0xabcdef" }],
    });
    expect(quote.calls[0].value).toBe("0");
  });

  it("maps a Solana quote", () => {
    expect(parseSolanaSwapQuote(SOLANA_SWAP_QUOTE).unsignedTransactionBase64).toBe("AQAB");
  });

  it("maps status, history, submissions and challenges", () => {
    expect(parseSwapStatus(SWAP_STATUS).status).toBe("CONFIRMING");
    expect(parseSwapPage(SWAP_PAGE).meta.total).toBe(1);
    expect(parseSubmission(SUBMISSION).status).toBe("SUBMITTED");
    expect(parseWalletChallenge(WALLET_CHALLENGE).message).toBe("Sign to link this wallet");
  });

  it("throws a shape error naming the field that drifted", () => {
    const error = (() => {
      try {
        parseSwapStatus({ swapId: "s1", status: "DONE", updatedAt: "x" });
      } catch (e) {
        return e;
      }
      return null;
    })();
    expect(error).toBeInstanceOf(TradeShapeError);
    expect((error as TradeShapeError).message).toContain("status");
  });
});

describe("token activity", () => {
  const pageWith = (row: Record<string, unknown>) => ({
    items: [{ ...LIVE_LIST_TOKEN, ...row }],
    meta: LIVE_TOKEN_PAGE.meta,
  });

  it("fills every window the row carries to all four fields, null where absent", () => {
    const [token] = parseTokenPage(
      pageWith({
        activity: {
          "1h": { volumeUsd: "1200.5", transactions: 40 },
          "24h": { volumeUsd: "9000", transactions: 300, traders: 80, priceChangePercent: "-4.5" },
        },
        pairCreatedAt: "2026-09-15T08:00:00.000Z",
      })
    ).items;
    expect(token.activity).toEqual({
      "1h": { volumeUsd: "1200.5", transactions: 40, traders: null, priceChangePercent: null },
      "24h": { volumeUsd: "9000", transactions: 300, traders: 80, priceChangePercent: "-4.5" },
    });
    expect(token.pairCreatedAt).toBe("2026-09-15T08:00:00.000Z");
  });

  // A window the providers do not fill is not estimated from another one.
  it("leaves a window out rather than inventing one", () => {
    const [token] = parseTokenPage(
      pageWith({ activity: { "5m": {}, "6h": null, "4h": {} } })
    ).items;
    expect(token.activity).toEqual({
      "5m": { volumeUsd: null, transactions: null, traders: null, priceChangePercent: null },
    });
  });

  it("keeps the change exactly as the service wrote it", () => {
    const [token] = parseTokenPage(
      pageWith({ activity: { "5m": { priceChangePercent: "12.340000000000002" } } })
    ).items;
    expect(token.activity?.["5m"]?.priceChangePercent).toBe("12.340000000000002");
  });

  it("reads a count that is not a whole, non-negative number as unavailable", () => {
    const [token] = parseTokenPage(
      pageWith({ activity: { "1h": { transactions: 1.5, traders: -2 }, "24h": { traders: 7 } } })
    ).items;
    expect(token.activity?.["1h"]?.transactions).toBeNull();
    expect(token.activity?.["1h"]?.traders).toBeNull();
    expect(token.activity?.["24h"]?.traders).toBe(7);
  });

  it("reads a null pair creation time as null", () => {
    const [token] = parseTokenPage(pageWith({ activity: {}, pairCreatedAt: null })).items;
    expect(token.activity).toEqual({});
    expect(token.pairCreatedAt).toBeNull();
  });

  it("maps trending rows the same way", () => {
    const [token] = parseTokenPage({
      ...LIVE_TRENDING_PAGE,
      items: [{ ...LIVE_TRENDING_PAGE.items[0], activity: { "12h": { traders: 5 } } }],
    }).items;
    expect(token.activity?.["12h"]?.traders).toBe(5);
    expect(token.pairCreatedAt).toBeNull();
  });

  // Search rows carry neither field. They stay undefined so a search row is
  // never mistaken for a coin with no activity at all.
  it("leaves both fields undefined on a row that carries neither", () => {
    const [row] = parseTokenSearch([LIVE_SEARCH_ROW]);
    expect(row).not.toHaveProperty("activity");
    expect(row).not.toHaveProperty("pairCreatedAt");
    const [listed] = parseTokenPage(LIVE_TOKEN_PAGE).items;
    expect(listed).not.toHaveProperty("activity");
    expect(listed).not.toHaveProperty("pairCreatedAt");
  });

  it("does not add either field to the detail read", () => {
    const token = parseTokenView({
      ...LIVE_TOKEN_DETAIL,
      activity: { "24h": { traders: 1 } },
      pairCreatedAt: "2026-09-15T08:00:00.000Z",
    });
    expect(token).not.toHaveProperty("activity");
    expect(token).not.toHaveProperty("pairCreatedAt");
  });
});

// The prod trade service has been sending 24h changes of up to 2.8e19 percent
// (果蝇, ARGUS, 2026-09-16), which rendered as "$100 -> $22,478,541,914,774,794"
// on the trending strip. A percentage that large is not a market move, it is a
// division by a missing or near-zero baseline price upstream. The boundary is
// where we are required to map an upstream payload into our own domain, so an
// impossible reading is mapped to "unavailable" rather than carried through.
// It is never replaced with an invented number: the strip shows no change at
// all for that window, and every other field on the token still parses.
describe("impossible price changes", () => {
  const changeOf = (priceChangePercent: unknown) =>
    parseTokenPage({
      items: [
        {
          ...LIVE_LIST_TOKEN,
          activity: {
            "24h": { volumeUsd: "9000", transactions: 300, traders: 80, priceChangePercent },
          },
        },
      ],
      meta: LIVE_TOKEN_PAGE.meta,
    }).items[0];

  it("drops a change too large to be a real market move", () => {
    const token = changeOf("22478541914774794240");

    expect(token.activity?.["24h"]?.priceChangePercent).toBeNull();
    // The rest of the window survives: only the unusable field is dropped.
    expect(token.activity?.["24h"]?.volumeUsd).toBe("9000");
    expect(token.activity?.["24h"]?.transactions).toBe(300);
  });

  it("keeps a large but real memecoin move", () => {
    expect(changeOf("94000").activity?.["24h"]?.priceChangePercent).toBe("94000");
  });

  it("keeps ordinary and negative changes untouched", () => {
    for (const value of ["-4.5", "0", "12.340000000000002", "-99.9"]) {
      expect(changeOf(value).activity?.["24h"]?.priceChangePercent).toBe(value);
    }
  });

  it("drops a change that is not a number at all", () => {
    expect(changeOf("NaN").activity?.["24h"]?.priceChangePercent).toBeNull();
  });

  // The ceiling itself is a real reading, in both directions. Only past it does
  // the figure stop being a market move.
  it("keeps the value on the ceiling and drops the one just past it", () => {
    expect(changeOf("1000000").activity?.["24h"]?.priceChangePercent).toBe("1000000");
    expect(changeOf("-1000000").activity?.["24h"]?.priceChangePercent).toBe("-1000000");
    expect(changeOf("1000000.1").activity?.["24h"]?.priceChangePercent).toBeNull();
    expect(changeOf("-1000000.1").activity?.["24h"]?.priceChangePercent).toBeNull();
    // The service writes a large figure in exponent form as often as in full.
    expect(changeOf("2.8e19").activity?.["24h"]?.priceChangePercent).toBeNull();
  });

  // The service computes every window the same way, so an impossible reading
  // can land on any of them, and each is judged on its own.
  it("judges every window, not only 24h", () => {
    const [token] = parseTokenPage({
      items: [
        {
          ...LIVE_LIST_TOKEN,
          activity: {
            "5m": { priceChangePercent: "2.8e19" },
            "1h": { priceChangePercent: "-7e12" },
            "6h": { priceChangePercent: "31.5" },
          },
        },
      ],
      meta: LIVE_TOKEN_PAGE.meta,
    }).items;

    expect(token.activity?.["5m"]?.priceChangePercent).toBeNull();
    expect(token.activity?.["1h"]?.priceChangePercent).toBeNull();
    expect(token.activity?.["6h"]?.priceChangePercent).toBe("31.5");
  });

  // The flat field carries the same measurement and most of the desk renders it
  // directly, so an unguarded one would put the nonsense back on the screen.
  // changeFor() also falls back to it when the 24h window has no change.
  it("drops an impossible flat 24h change on list, search and detail rows", () => {
    const [listed] = parseTokenPage({
      items: [{ ...LIVE_LIST_TOKEN, priceChange24hPercent: "22478541914774794240" }],
      meta: LIVE_TOKEN_PAGE.meta,
    }).items;
    expect(listed.priceChange24hPercent).toBeNull();
    // The price beside it is untouched: only the change was unusable.
    expect(listed.priceUsd).toBe(LIVE_LIST_TOKEN.priceUsd);

    const [found] = parseTokenSearch([{ ...LIVE_SEARCH_ROW, priceChange24hPercent: "2.8e19" }]);
    expect(found.priceChange24hPercent).toBeNull();

    const detail = parseTokenView({ ...LIVE_TOKEN_DETAIL, priceChange24hPercent: "2.8e19" });
    expect(detail.priceChange24hPercent).toBeNull();
  });

  it("keeps a real flat 24h change", () => {
    const [listed] = parseTokenPage({
      items: [{ ...LIVE_LIST_TOKEN, priceChange24hPercent: "-12.5" }],
      meta: LIVE_TOKEN_PAGE.meta,
    }).items;
    expect(listed.priceChange24hPercent).toBe("-12.5");
  });
});
