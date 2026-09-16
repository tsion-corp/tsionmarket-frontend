// @vitest-environment jsdom
// This suite renders, so it needs a DOM. vitest.config.ts puts .ts suites in
// the node project to avoid booting jsdom for the many that never touch it;
// the pragma above opts this one back in, per that config's own note.
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketToken } from "@/lib/market-catalog";

const useMarketTokens = vi.fn();
vi.mock("@/features/trade/hooks/use-market-tokens", () => ({
  useMarketTokens: (filter: string) => useMarketTokens(filter),
}));

const { useTokenSpots } = await import("./tokens");

const token = (over: Partial<MarketToken> = {}): MarketToken => ({
  id: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  logo: "https://cdn.example/btc.png",
  priceUsd: 110_000,
  change24h: 2.5,
  marketCap: 2_100_000_000_000,
  ...over,
});

const feed = (tokens: MarketToken[], loading = false) => {
  useMarketTokens.mockReturnValue({ data: tokens, isLoading: loading });
};

/** A cap-ordered feed of majors, the shape the live popular list arrives in. */
const majors = (): MarketToken[] => [
  token({ id: "bitcoin", symbol: "BTC", change24h: 0.41, marketCap: 1_588_000_000_000 }),
  token({ id: "ethereum", symbol: "ETH", change24h: 1.0, marketCap: 306_000_000_000 }),
  token({ id: "binancecoin", symbol: "BNB", change24h: 1.2, marketCap: 100_000_000_000 }),
  token({ id: "ripple", symbol: "XRP", change24h: 2.82, marketCap: 89_000_000_000 }),
  token({ id: "solana", symbol: "SOL", change24h: 0.88, marketCap: 61_000_000_000 }),
  token({ id: "tron", symbol: "TRX", change24h: 0.99, marketCap: 32_000_000_000 }),
  token({ id: "zcash", symbol: "ZEC", change24h: 9.32, marketCap: 20_800_000_000 }),
  token({ id: "hyperliquid", symbol: "HYPE", change24h: 1.8, marketCap: 19_100_000_000 }),
];

beforeEach(() => {
  useMarketTokens.mockReset();
});

describe("useTokenSpots", () => {
  it("reads the popular feed, the same entry the spot desk already holds", () => {
    feed([token()]);
    renderHook(() => useTokenSpots());
    expect(useMarketTokens).toHaveBeenCalledWith("popular");
  });

  it("formats every figure, so the card never sees a number", () => {
    feed([token({ priceUsd: 110_000, change24h: 2.5 })]);
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens).toEqual([
      {
        symbol: "BTC",
        name: "Bitcoin",
        price: "$110,000.00",
        priceUsd: 110_000,
        coingeckoId: "bitcoin",
        change: "+2.50%",
        up: true,
        movePercent: "2.50%",
        logo: "https://cdn.example/btc.png",
        href: "/spot/btc",
      },
    ]);
  });

  // Without this the detail sheet could only chart the dozen tickers in
  // COINGECKO_IDS, and the rest of the row would show an empty chart even
  // though the feed came from CoinGecko and named the coin.
  it("carries the feed's coin id, so the chart is the asset's own", () => {
    feed([token({ id: "hyperliquid", symbol: "HYPE" })]);
    const { result } = renderHook(() => useTokenSpots());
    expect(result.current.tokens[0].coingeckoId).toBe("hyperliquid");
  });

  it("omits a blank coin id rather than passing an empty string on", () => {
    feed([token({ id: "  " })]);
    const { result } = renderHook(() => useTokenSpots());
    expect(result.current.tokens[0]).not.toHaveProperty("coingeckoId");
  });

  it("carries the raw price alongside the formatted one, for the buy sheet", () => {
    feed([token({ priceUsd: 42.5 })]);
    const { result } = renderHook(() => useTokenSpots());
    expect(result.current.tokens[0].priceUsd).toBe(42.5);
  });

  it("invents nothing when the feed is empty", () => {
    // The defect this replaces: with no data the card drew a hardcoded BTC at
    // $1,876,617 and +12.8%. An empty feed must produce an empty row.
    feed([]);
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens).toEqual([]);
    expect(JSON.stringify(result.current.tokens)).not.toMatch(/1,876,617|12\.8/);
  });

  it("reports loading so the card can draw a skeleton instead of a figure", () => {
    feed([], true);
    const { result } = renderHook(() => useTokenSpots());
    expect(result.current.loading).toBe(true);
  });

  it("drops a token with no 24h move, because a defaulted zero looks the same", () => {
    // lib/server/market-tokens.ts maps a missing price_change_percentage_24h to
    // 0, so an unknown move and a genuinely flat one are indistinguishable
    // here. Neither has a move to report, and the move is on the card.
    feed([token({ change24h: 0 }), token({ symbol: "ETH", change24h: 1.2 })]);
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["ETH"]);
  });

  it("features the biggest tokens, not whatever moved most today", () => {
    // The defect: ranked purely by the size of the 24h move the card filled up
    // with the day's most volatile micro caps. The spot desk trades the majors.
    feed([
      ...majors().slice(0, 5),
      token({ id: "vvv", symbol: "VVV", change24h: 44.17, marketCap: 90_000_000 }),
      token({ id: "polkadot", symbol: "DOT", change24h: 12.08, marketCap: 80_000_000 }),
      token({ id: "cosmos", symbol: "ATOM", change24h: 11.84, marketCap: 70_000_000 }),
    ]);
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["BTC", "ETH", "BNB", "XRP", "SOL"]);
  });

  it("orders the row by market cap, biggest first", () => {
    feed([
      token({ symbol: "AAA", change24h: 9, marketCap: 1_000_000 }),
      token({ symbol: "BBB", change24h: 1, marketCap: 9_000_000 }),
      token({ symbol: "CCC", change24h: 4, marketCap: 4_000_000 }),
    ]);
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["BBB", "CCC", "AAA"]);
  });

  it("shows a major that is down as down, rather than hiding a red day", () => {
    feed([
      token({ symbol: "BTC", change24h: -3.5, marketCap: 1_588_000_000_000 }),
      token({ symbol: "AAA", change24h: 40, marketCap: 1_000_000 }),
    ]);
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens[0].symbol).toBe("BTC");
    expect(result.current.tokens[0].change).toBe("-3.50%");
    expect(result.current.tokens[0].up).toBe(false);
  });

  it("holds a slot for a named token the cap ranking would have cut", () => {
    // HYPE is eighth by cap here, so a plain top five leaves it out. The user
    // trades it, so it is held a slot, and the token that gives the slot up is
    // the smallest one nobody named: XRP, not SOL.
    feed(majors());
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens.map((t) => t.symbol)).toEqual([
      "BTC",
      "ETH",
      "BNB",
      "SOL",
      "HYPE",
    ]);
  });

  it("never drops one named token to make room for a smaller named one", () => {
    // Every slot here is already a named token, so APE has nothing it may take.
    // Swapping a bigger major out for a smaller one gains the row nothing.
    feed([
      ...majors().filter((t) => t.symbol !== "XRP" && t.symbol !== "TRX" && t.symbol !== "ZEC"),
      token({ id: "apecoin", symbol: "APE", change24h: 3.1, marketCap: 400_000_000 }),
    ]);
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens.map((t) => t.symbol)).toEqual([
      "BTC",
      "ETH",
      "BNB",
      "SOL",
      "HYPE",
    ]);
  });

  it("holds at most half the row, so the rest is still the cap ranking", () => {
    feed([
      token({ symbol: "AAA", change24h: 1, marketCap: 900_000_000 }),
      token({ symbol: "BBB", change24h: 1, marketCap: 800_000_000 }),
      token({ symbol: "CCC", change24h: 1, marketCap: 700_000_000 }),
      token({ symbol: "DDD", change24h: 1, marketCap: 600_000_000 }),
      token({ symbol: "EEE", change24h: 1, marketCap: 500_000_000 }),
      token({ symbol: "BTC", change24h: 1, marketCap: 400_000_000 }),
      token({ symbol: "ETH", change24h: 1, marketCap: 300_000_000 }),
      token({ symbol: "SOL", change24h: 1, marketCap: 200_000_000 }),
    ]);
    const { result } = renderHook(() => useTokenSpots());

    // Two slots held, three left to the ranking. SOL is the third named token
    // in the tail and does not get in.
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["AAA", "BBB", "CCC", "BTC", "ETH"]);
  });

  it("fills the row from the cap ranking when the feed carries no named token", () => {
    // The named list is a preference, not the whole card. Nothing here is named
    // and the row still fills, biggest first.
    feed([
      token({ symbol: "LINK", change24h: -0.84, marketCap: 9_387_000_000 }),
      token({ symbol: "XMR", change24h: -2.51, marketCap: 9_507_000_000 }),
      token({ symbol: "ZEC", change24h: 9.32, marketCap: 20_800_000_000 }),
      token({ symbol: "TRX", change24h: 0.99, marketCap: 32_100_000_000 }),
      token({ symbol: "WBT", change24h: 7.45, marketCap: 9_658_000_000 }),
      token({ symbol: "RAIN", change24h: -1.23, marketCap: 11_392_000_000 }),
    ]);
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens.map((t) => t.symbol)).toEqual([
      "TRX",
      "ZEC",
      "RAIN",
      "WBT",
      "XMR",
    ]);
  });

  it("invents no named token the feed does not carry", () => {
    // APE is named but is not in the live popular list. A held slot may only
    // promote a token that is really in the feed.
    feed(majors());
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens.map((t) => t.symbol)).not.toContain("APE");
  });

  it("never features a stablecoin, which has no spot market and no move", () => {
    // USDT and USDC sit third and sixth by cap in the live feed. Neither is a
    // spot market (lib/spot-chart drops them), so the card would link nowhere,
    // and a peg holding at $1.00 is not a move worth a card.
    feed([
      token({ symbol: "BTC", change24h: 0.41, marketCap: 1_588_000_000_000 }),
      token({
        symbol: "USDT",
        priceUsd: 0.999682,
        change24h: -0.00675,
        marketCap: 183_000_000_000,
      }),
      token({ symbol: "USDC", priceUsd: 0.99993, change24h: 0.00572, marketCap: 74_000_000_000 }),
      token({ symbol: "ETH", change24h: 1.0, marketCap: 306_000_000_000 }),
    ]);
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["BTC", "ETH"]);
  });

  it("features five tokens, the count the design cycles through", () => {
    feed(
      Array.from({ length: 12 }, (_, i) =>
        token({ symbol: `T${i}`, id: `t${i}`, change24h: i + 1, marketCap: 12_000_000 - i })
      )
    );
    const { result } = renderHook(() => useTokenSpots());
    expect(result.current.tokens).toHaveLength(5);
  });

  it("drops a delisted token rather than pointing at a page that cannot buy it", () => {
    feed([
      token({ symbol: "DOGE", change24h: 30, marketCap: 14_000_000_000 }),
      token({ symbol: "ETH", change24h: 1, marketCap: 306_000_000_000 }),
    ]);
    const { result } = renderHook(() => useTokenSpots());
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["ETH"]);
  });

  it("drops a token with no price or no symbol", () => {
    feed([
      token({ symbol: "", change24h: 5 }),
      token({ symbol: "AAA", priceUsd: 0, change24h: 5 }),
      token({ symbol: "BBB", change24h: 5 }),
    ]);
    const { result } = renderHook(() => useTokenSpots());
    expect(result.current.tokens.map((t) => t.symbol)).toEqual(["BBB"]);
  });

  it("keeps one row per ticker, the bigger listing of the duplicates", () => {
    // The feed carries the same ticker in either casing, and the row is ranked
    // by cap, so the duplicate kept is the one carrying the cap that ranked it.
    feed([
      token({ symbol: "btc", id: "a", change24h: 1, marketCap: 400_000 }),
      token({ symbol: "BTC", id: "b", change24h: 8, marketCap: 1_588_000_000_000 }),
    ]);
    const { result } = renderHook(() => useTokenSpots());

    expect(result.current.tokens).toHaveLength(1);
    expect(result.current.tokens[0].symbol).toBe("BTC");
    expect(result.current.tokens[0].change).toBe("+8.00%");
  });

  it("refuses a non-http logo rather than passing it to an img", () => {
    feed([token({ logo: "javascript:alert(1)" })]);
    const { result } = renderHook(() => useTokenSpots());
    expect(result.current.tokens[0].logo).toBeNull();
  });

  it("drops the decimals on a move past 100%, where they are noise", () => {
    feed([token({ change24h: 240.7 })]);
    const { result } = renderHook(() => useTokenSpots());
    expect(result.current.tokens[0].change).toBe("+241%");
    expect(result.current.tokens[0].movePercent).toBe("241%");
  });

  it("holds the same array across a refetch that changed nothing", () => {
    // A fresh array is a fresh set of cards to the row, which would restart the
    // ten second rotation mid-cycle on every background refetch.
    feed(majors());
    const { result, rerender } = renderHook(() => useTokenSpots());
    const first = result.current.tokens;

    feed(majors());
    rerender();

    expect(result.current.tokens).toBe(first);
  });

  it("holds the same array when only the raw price ticks below display precision", () => {
    // priceUsd moves almost every refetch, often by less than the formatted
    // price's two decimals show. It must not be part of the rotation's
    // change check, or the row would restart on every tick.
    feed([token({ priceUsd: 110_000 })]);
    const { result, rerender } = renderHook(() => useTokenSpots());
    const first = result.current.tokens;

    feed([token({ priceUsd: 110_000.001 })]);
    rerender();

    expect(result.current.tokens).toBe(first);
    expect(result.current.tokens[0].priceUsd).toBe(110_000);
  });

  it("passes on a real change", () => {
    feed([token({ change24h: 2.5 })]);
    const { result, rerender } = renderHook(() => useTokenSpots());
    const first = result.current.tokens;

    feed([token({ change24h: 6.5 })]);
    rerender();

    expect(result.current.tokens).not.toBe(first);
    expect(result.current.tokens[0].change).toBe("+6.50%");
  });
});
