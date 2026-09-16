import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEFRAME,
  EMPTY_FILTERS,
  MEME_TIMEFRAMES,
  SCREENER_METRICS,
  SCREENER_PRESETS,
  TIMEFRAME_SCOPED,
  activeCount,
  ageMinutes,
  applyScreener,
  compareDecimal,
  draftFrom,
  hasBounds,
  isMemeTimeframe,
  isScreenerFilters,
  metricValue,
  parseBoundInput,
  presetFor,
  readDraft,
  screenerActive,
  screenerQuery,
  trendingQuery,
  type ScreenerDraft,
  type ScreenerFilters,
  usesTimeframe,
} from "@/lib/meme/screener";
import type { ScreenerBound, ScreenerMetric, SortOrder } from "@/lib/meme/screener";
import type { MemeToken } from "@/lib/meme/types";

// The screener's model: what a typed bound means, what the backend is asked
// for, and what a restored session may hold. Every bound is a decimal string
// compared exactly, so "0.1" and "0.10000000000000001" are never confused.

function emptyDraft(): ScreenerDraft {
  return draftFrom(EMPTY_FILTERS);
}

function filters(
  bounds: ScreenerFilters["bounds"],
  sort: ScreenerFilters["sort"] = null
): ScreenerFilters {
  return { bounds, sort };
}

describe("constants", () => {
  it("lists the windows, metrics and the timeframe-scoped ones in contract order", () => {
    expect(MEME_TIMEFRAMES).toEqual(["5m", "1h", "6h", "12h", "24h"]);
    expect(DEFAULT_TIMEFRAME).toBe("24h");
    expect(SCREENER_METRICS).toEqual([
      "marketCap",
      "price",
      "age",
      "transactions",
      "volume",
      "traders",
      "liquidity",
    ]);
    expect([...TIMEFRAME_SCOPED].sort()).toEqual(["traders", "transactions", "volume"]);
    expect(EMPTY_FILTERS).toEqual({ bounds: {}, sort: null });
  });
});

describe("parseBoundInput", () => {
  it("reads empty input as no bound", () => {
    expect(parseBoundInput("")).toBe("");
    expect(parseBoundInput("   ")).toBe("");
  });

  it("scales k, m and b exactly, in either case", () => {
    expect(parseBoundInput("250k")).toBe("250000");
    expect(parseBoundInput("1.5m")).toBe("1500000");
    expect(parseBoundInput("2B")).toBe("2000000000");
    expect(parseBoundInput("0.0005k")).toBe("0.5");
    expect(parseBoundInput("1.23456789b")).toBe("1234567890");
    expect(parseBoundInput("0.0000000001b")).toBe("0.1");
    expect(parseBoundInput("3K")).toBe("3000");
  });

  it("trims and strips thousands commas", () => {
    expect(parseBoundInput(" 0.00001 ")).toBe("0.00001");
    expect(parseBoundInput("1,000")).toBe("1000");
    expect(parseBoundInput("1,250,000.5")).toBe("1250000.5");
    // Commas are separators only, wherever they sit.
    expect(parseBoundInput("10,00")).toBe("1000");
  });

  it("canonicalises leading and trailing zeros and bare points", () => {
    expect(parseBoundInput("007")).toBe("7");
    expect(parseBoundInput("1.50")).toBe("1.5");
    expect(parseBoundInput("1.")).toBe("1");
    expect(parseBoundInput(".5")).toBe("0.5");
    expect(parseBoundInput("0")).toBe("0");
    expect(parseBoundInput("000.000")).toBe("0");
    expect(parseBoundInput("0.10k")).toBe("100");
  });

  it("keeps digits past a float's precision", () => {
    expect(parseBoundInput("123456789012345678901234567890.000000000000000000001")).toBe(
      "123456789012345678901234567890.000000000000000000001"
    );
  });

  it("rejects signs, exponents, words and malformed numbers", () => {
    for (const raw of [
      "-5",
      "+5",
      "1e5",
      "1E-3",
      "1.2.3",
      "k",
      ".k",
      ".",
      ",",
      "NaN",
      "Infinity",
      "abc",
      "5 k",
      "1 000",
      "5kk",
      "5t",
      "0x10",
      "١٢",
    ]) {
      expect(parseBoundInput(raw), raw).toBeNull();
    }
  });
});

describe("compareDecimal", () => {
  it("compares exactly, not through floats", () => {
    expect(compareDecimal("1", "2")).toBe(-1);
    expect(compareDecimal("10", "9")).toBe(1);
    expect(compareDecimal("0.1", "0.10")).toBe(0);
    expect(compareDecimal("9007199254740993", "9007199254740992")).toBe(1);
    expect(compareDecimal("0.30000000000000001", "0.3")).toBe(1);
    expect(compareDecimal("100", "99.999999999999999999")).toBe(1);
    expect(compareDecimal("0", "0")).toBe(0);
    expect(compareDecimal("0.05", "0.5")).toBe(-1);
  });
});

describe("draftFrom and readDraft", () => {
  it("round-trips applied bounds through a draft", () => {
    const applied = filters({
      marketCap: { max: "1000000" },
      volume: { min: "5000", max: "9000" },
    });
    const draft = draftFrom(applied);
    expect(draft.marketCap).toEqual({ min: "", max: "1000000" });
    expect(draft.price).toEqual({ min: "", max: "" });
    expect(readDraft(draft)).toEqual({ ok: true, bounds: applied.bounds });
  });

  it("has a row for every metric", () => {
    expect(Object.keys(emptyDraft()).sort()).toEqual([...SCREENER_METRICS].sort());
  });

  it("applies typed input in canonical form and leaves empty metrics out", () => {
    const draft = emptyDraft();
    draft.liquidity = { min: "100k", max: "" };
    draft.age = { min: "", max: " 60 " };
    expect(readDraft(draft)).toEqual({
      ok: true,
      bounds: { liquidity: { min: "100000" }, age: { max: "60" } },
    });
  });

  it("names every field that is not a number", () => {
    const draft = emptyDraft();
    draft.price = { min: "abc", max: "-1" };
    draft.traders = { min: "5", max: "1e3" };
    expect(readDraft(draft)).toEqual({
      ok: false,
      errors: { price: { min: "notNumber", max: "notNumber" }, traders: { max: "notNumber" } },
    });
  });

  it("flags a min above its max on the min, comparing exactly", () => {
    const draft = emptyDraft();
    draft.volume = { min: "1.5m", max: "1,000,000" };
    draft.price = { min: "0.30000000000000001", max: "0.3" };
    draft.marketCap = { min: "5", max: "5" };
    expect(readDraft(draft)).toEqual({
      ok: false,
      errors: { volume: { min: "minAboveMax" }, price: { min: "minAboveMax" } },
    });
  });
});

describe("activity flags", () => {
  it("counts a sort and each set side", () => {
    expect(screenerActive(EMPTY_FILTERS)).toBe(false);
    expect(hasBounds(EMPTY_FILTERS)).toBe(false);
    expect(activeCount(EMPTY_FILTERS)).toBe(0);

    const sortOnly = filters({}, { by: "volume", order: "desc" });
    expect(screenerActive(sortOnly)).toBe(true);
    expect(hasBounds(sortOnly)).toBe(false);
    expect(activeCount(sortOnly)).toBe(1);

    const both = filters(
      { price: { min: "1", max: "2" }, age: { max: "60" } },
      {
        by: "age",
        order: "asc",
      }
    );
    expect(screenerActive(both)).toBe(true);
    expect(hasBounds(both)).toBe(true);
    expect(activeCount(both)).toBe(4);
  });

  it("does not count an empty bound object", () => {
    const hollow = filters({ price: {} });
    expect(hasBounds(hollow)).toBe(false);
    expect(screenerActive(hollow)).toBe(false);
    expect(activeCount(hollow)).toBe(0);
  });

  it("uses the timeframe only for a scoped bound, or a scoped sort when asked", () => {
    expect(usesTimeframe(filters({ price: { min: "1" } }), true)).toBe(false);
    expect(usesTimeframe(filters({ traders: { min: "1" } }), false)).toBe(true);
    const scopedSort = filters({ price: { min: "1" } }, { by: "transactions", order: "desc" });
    expect(usesTimeframe(scopedSort, true)).toBe(true);
    expect(usesTimeframe(scopedSort, false)).toBe(false);
    expect(usesTimeframe(filters({}, { by: "age", order: "asc" }), true)).toBe(false);
  });
});

describe("screenerQuery", () => {
  it("is empty when nothing is applied", () => {
    expect(screenerQuery(EMPTY_FILTERS, "1h")).toBe("");
    expect(screenerQuery(filters({ volume: {} }), "1h")).toBe("");
  });

  it("builds the canonical, sorted query", () => {
    const f = filters(
      { liquidity: { min: "10000" }, marketCap: { max: "1000000" } },
      { by: "volume", order: "desc" }
    );
    expect(screenerQuery(f, "1h")).toBe(
      "maxMarketCapUsd=1000000&minLiquidityUsd=10000&sortBy=volume&sortOrder=desc&timeframe=1h"
    );
  });

  it("gives equal filters one key whatever order they were set in", () => {
    const a = filters({ price: { max: "2", min: "1" }, age: { max: "60" } });
    const b = filters({ age: { max: "60" }, price: { min: "1", max: "2" } });
    expect(screenerQuery(a, "24h")).toBe(screenerQuery(b, "24h"));
    expect(screenerQuery(a, "24h")).toBe("maxAgeMinutes=60&maxPriceUsd=2&minPriceUsd=1");
  });

  it("uses the canonical name for every metric", () => {
    const f = filters({
      marketCap: { min: "1" },
      price: { min: "2" },
      age: { min: "3" },
      transactions: { min: "4" },
      volume: { min: "5" },
      traders: { min: "6" },
      liquidity: { min: "7" },
    });
    expect(screenerQuery(f, "5m")).toBe(
      "minAgeMinutes=3&minLiquidityUsd=7&minMarketCapUsd=1&minPriceUsd=2&minTraders=6&minTransactions=4&minVolumeUsd=5&timeframe=5m"
    );
  });

  it("leaves the timeframe out when nothing depends on it", () => {
    const f = filters({ price: { min: "0.5" } }, { by: "age", order: "asc" });
    expect(screenerQuery(f, "5m")).toBe("minPriceUsd=0.5&sortBy=age&sortOrder=asc");
  });

  it("sends the timeframe for a scoped sort alone", () => {
    expect(screenerQuery(filters({}, { by: "traders", order: "asc" }), "12h")).toBe(
      "sortBy=traders&sortOrder=asc&timeframe=12h"
    );
  });
});

describe("trendingQuery", () => {
  it("never carries the sort", () => {
    const f = filters({ marketCap: { max: "1000000" } }, { by: "volume", order: "desc" });
    expect(trendingQuery(f, "1h")).toBe("maxMarketCapUsd=1000000");
  });

  it("is empty for a sort-only screener", () => {
    expect(trendingQuery(filters({}, { by: "traders", order: "desc" }), "1h")).toBe("");
  });

  it("carries the timeframe only for a scoped bound", () => {
    expect(trendingQuery(filters({ volume: { min: "100" } }, null), "6h")).toBe(
      "minVolumeUsd=100&timeframe=6h"
    );
  });
});

describe("presets", () => {
  it("defines the five presets as plain bounds and sorts", () => {
    expect(SCREENER_PRESETS.map((p) => p.id)).toEqual([
      "fresh",
      "movers",
      "micro",
      "deep",
      "crowd",
    ]);
    const byId = Object.fromEntries(SCREENER_PRESETS.map((p) => [p.id, p.filters]));
    expect(byId.fresh).toEqual({
      bounds: { age: { max: "60" } },
      sort: { by: "age", order: "asc" },
    });
    expect(byId.movers).toEqual({ bounds: {}, sort: { by: "volume", order: "desc" } });
    expect(byId.micro).toEqual({ bounds: { marketCap: { max: "1000000" } }, sort: null });
    expect(byId.deep).toEqual({ bounds: { liquidity: { min: "100000" } }, sort: null });
    expect(byId.crowd).toEqual({ bounds: {}, sort: { by: "traders", order: "desc" } });
  });

  it("matches each preset exactly", () => {
    for (const preset of SCREENER_PRESETS) {
      expect(presetFor(structuredClone(preset.filters))).toBe(preset.id);
    }
  });

  it("does not match a near miss", () => {
    expect(presetFor(EMPTY_FILTERS)).toBeNull();
    // Same bound, different sort direction.
    expect(presetFor(filters({ age: { max: "60" } }, { by: "age", order: "desc" }))).toBeNull();
    // Same bound, no sort.
    expect(presetFor(filters({ age: { max: "60" } }))).toBeNull();
    // An extra bound on top of a preset.
    expect(
      presetFor(filters({ age: { max: "60", min: "1" } }, { by: "age", order: "asc" }))
    ).toBeNull();
    expect(presetFor(filters({ price: { min: "1" } }, { by: "volume", order: "desc" }))).toBeNull();
    // The same value on the other side.
    expect(presetFor(filters({ marketCap: { min: "1000000" } }))).toBeNull();
    expect(presetFor(filters({ marketCap: { max: "999999" } }))).toBeNull();
  });

  it("cannot be changed through the shared constants", () => {
    expect(Object.isFrozen(EMPTY_FILTERS)).toBe(true);
    expect(Object.isFrozen(EMPTY_FILTERS.bounds)).toBe(true);
    for (const preset of SCREENER_PRESETS) expect(Object.isFrozen(preset.filters)).toBe(true);
  });
});

describe("isScreenerFilters", () => {
  it("accepts the empty filters, every preset and a JSON round trip", () => {
    expect(isScreenerFilters({ bounds: {}, sort: null })).toBe(true);
    for (const preset of SCREENER_PRESETS) {
      expect(isScreenerFilters(JSON.parse(JSON.stringify(preset.filters)))).toBe(true);
    }
    expect(
      isScreenerFilters({
        bounds: { price: { min: "0.00001", max: "2.5" }, traders: { min: "10" } },
        sort: { by: "liquidity", order: "desc" },
      })
    ).toBe(true);
  });

  it("rejects anything that is not the filters object", () => {
    for (const value of [null, undefined, "filters", 3, [], [{ bounds: {}, sort: null }]]) {
      expect(isScreenerFilters(value), String(value)).toBe(false);
    }
    expect(isScreenerFilters({ bounds: {} })).toBe(false);
    expect(isScreenerFilters({ sort: null })).toBe(false);
    expect(isScreenerFilters({ bounds: {}, sort: null, timeframe: "1h" })).toBe(false);
    expect(isScreenerFilters({ bounds: [], sort: null })).toBe(false);
    expect(isScreenerFilters({ bounds: null, sort: null })).toBe(false);
  });

  it("rejects an unknown metric or bound key", () => {
    expect(isScreenerFilters({ bounds: { fdv: { min: "1" } }, sort: null })).toBe(false);
    expect(isScreenerFilters({ bounds: { price: { low: "1" } }, sort: null })).toBe(false);
    expect(isScreenerFilters({ bounds: { price: "1" }, sort: null })).toBe(false);
    expect(isScreenerFilters({ bounds: { price: null }, sort: null })).toBe(false);
  });

  it("rejects a bound value that is not canonical", () => {
    for (const value of ["", "1.50", "007", "250k", "1,000", "-1", "1e3", " 1", 1, null]) {
      expect(
        isScreenerFilters({ bounds: { price: { min: value } }, sort: null }),
        JSON.stringify(value)
      ).toBe(false);
    }
  });

  it("rejects a min above its max", () => {
    expect(isScreenerFilters({ bounds: { price: { min: "2", max: "1" } }, sort: null })).toBe(
      false
    );
  });

  it("rejects a sort that is not a known metric and direction", () => {
    expect(isScreenerFilters({ bounds: {}, sort: { by: "fdv", order: "asc" } })).toBe(false);
    expect(isScreenerFilters({ bounds: {}, sort: { by: "age", order: "up" } })).toBe(false);
    expect(isScreenerFilters({ bounds: {}, sort: { by: "age" } })).toBe(false);
    expect(isScreenerFilters({ bounds: {}, sort: { by: "age", order: "asc", x: 1 } })).toBe(false);
    expect(isScreenerFilters({ bounds: {}, sort: "age" })).toBe(false);
  });
});

describe("isMemeTimeframe", () => {
  it("accepts the five windows only", () => {
    for (const tf of MEME_TIMEFRAMES) expect(isMemeTimeframe(tf)).toBe(true);
    for (const value of ["4h", "24H", "", null, 24, {}]) {
      expect(isMemeTimeframe(value), String(value)).toBe(false);
    }
  });
});

describe("ageMinutes", () => {
  const now = Date.parse("2026-09-15T12:00:00.000Z");

  it("floors whole minutes since the pair was created", () => {
    expect(ageMinutes("2026-09-15T11:00:00.000Z", now)).toBe(60);
    expect(ageMinutes("2026-09-15T11:58:30.000Z", now)).toBe(1);
    expect(ageMinutes("2026-09-15T11:59:30.000Z", now)).toBe(0);
    expect(ageMinutes("2026-09-15T12:00:00.000Z", now)).toBe(0);
  });

  it("is null for a missing, unreadable or future time", () => {
    expect(ageMinutes(null, now)).toBeNull();
    expect(ageMinutes(undefined, now)).toBeNull();
    expect(ageMinutes("not a date", now)).toBeNull();
    expect(ageMinutes("2026-09-15T12:00:01.000Z", now)).toBeNull();
  });
});

describe("metricValue", () => {
  const now = Date.parse("2026-09-15T12:00:00.000Z");
  const token: MemeToken = {
    chainId: 8453,
    address: "0xabc",
    name: "Test coin",
    symbol: "TEST",
    decimals: 18,
    logoUrl: null,
    priceUsd: "0.0012",
    liquidityUsd: "50000",
    volume24hUsd: "9000",
    priceChange24hPercent: "4",
    marketCapUsd: "1200000",
    fdvUsd: null,
    pairAddress: null,
    dexName: null,
    riskLevel: "LOW",
    buyEnabled: true,
    sellEnabled: true,
    warnings: [],
    activity: {
      "1h": { volumeUsd: "300", transactions: 12, traders: 7, priceChangePercent: "1" },
      "24h": { volumeUsd: null, transactions: 100, traders: null, priceChangePercent: null },
    },
    pairCreatedAt: "2026-09-15T10:30:00.000Z",
  };

  it("reads money as decimal strings", () => {
    expect(metricValue(token, "marketCap", "1h", now)).toEqual({ kind: "usd", value: "1200000" });
    expect(metricValue(token, "price", "1h", now)).toEqual({ kind: "usd", value: "0.0012" });
    expect(metricValue(token, "liquidity", "1h", now)).toEqual({ kind: "usd", value: "50000" });
  });

  it("reads windowed metrics from the selected window", () => {
    expect(metricValue(token, "volume", "1h", now)).toEqual({ kind: "usd", value: "300" });
    expect(metricValue(token, "transactions", "1h", now)).toEqual({ kind: "count", value: 12 });
    expect(metricValue(token, "traders", "1h", now)).toEqual({ kind: "count", value: 7 });
  });

  it("falls back to the flat 24h volume only for 24h", () => {
    expect(metricValue(token, "volume", "24h", now)).toEqual({ kind: "usd", value: "9000" });
    expect(metricValue(token, "traders", "24h", now)).toEqual({ kind: "count", value: null });
    expect(metricValue(token, "volume", "6h", now)).toEqual({ kind: "usd", value: null });
    expect(metricValue(token, "transactions", "5m", now)).toEqual({ kind: "count", value: null });
  });

  it("reads the flat 24h volume for a token with no activity at all", () => {
    const bare: MemeToken = { ...token, activity: undefined };
    expect(metricValue(bare, "volume", "24h", now)).toEqual({ kind: "usd", value: "9000" });
    expect(metricValue(bare, "volume", "1h", now)).toEqual({ kind: "usd", value: null });
  });

  it("reads age in minutes", () => {
    expect(metricValue(token, "age", "5m", now)).toEqual({ kind: "age", minutes: 90 });
    expect(metricValue({ ...token, pairCreatedAt: null }, "age", "5m", now)).toEqual({
      kind: "age",
      minutes: null,
    });
  });
});

// ---------------------------------------------------------------------------
// The client-side fallback
// ---------------------------------------------------------------------------

function coin(over: Partial<MemeToken> = {}): MemeToken {
  return {
    chainId: 8453,
    address: `0x${String(Math.random()).slice(2, 12).padEnd(40, "0")}`,
    name: "Coin",
    symbol: "COIN",
    decimals: 18,
    logoUrl: null,
    priceUsd: "1",
    liquidityUsd: "50000",
    volume24hUsd: "1000",
    priceChange24hPercent: "0",
    marketCapUsd: "500000",
    fdvUsd: null,
    pairAddress: null,
    dexName: null,
    riskLevel: "LOW",
    buyEnabled: true,
    sellEnabled: true,
    warnings: [],
    ...over,
  } as MemeToken;
}

const bounded = (metric: ScreenerMetric, bound: ScreenerBound): ScreenerFilters => ({
  bounds: { [metric]: bound },
  sort: null,
});

describe("applyScreener", () => {
  // The reason this exists, measured against production on 2026-09-16: the
  // service accepts maxMarketCapUsd and ignores it, answering a $1,000 cap with
  // cbBTC at a $3.49bn market cap. Sent alone, the table showed a filter as
  // applied over an unfiltered list.
  it("drops what the backend left in above a max", () => {
    const small = coin({ symbol: "APEC", marketCapUsd: "25564" });
    const huge = coin({ symbol: "cbBTC", marketCapUsd: "3491589227" });

    const kept = applyScreener([small, huge], bounded("marketCap", { max: "1000000" }), "24h");

    expect(kept.map((t) => t.symbol)).toEqual(["APEC"]);
  });

  it("drops what falls under a min", () => {
    const thin = coin({ symbol: "THIN", liquidityUsd: "900" });
    const deep = coin({ symbol: "DEEP", liquidityUsd: "250000" });

    const kept = applyScreener([thin, deep], bounded("liquidity", { min: "100000" }), "24h");

    expect(kept.map((t) => t.symbol)).toEqual(["DEEP"]);
  });

  // The contract is explicit that null means "not currently available", never
  // zero. Counting an unknown market cap as 0 would slip every unpriced coin
  // into every "under" filter, which is the opposite of what was asked for.
  it("excludes a coin whose metric the service could not report", () => {
    const known = coin({ symbol: "KNOWN", marketCapUsd: "1000" });
    const unknown = coin({ symbol: "UNKNOWN", marketCapUsd: null });

    const kept = applyScreener([known, unknown], bounded("marketCap", { max: "1000000" }), "24h");

    expect(kept.map((t) => t.symbol)).toEqual(["KNOWN"]);
  });

  it("applies both ends of a band, inclusively", () => {
    const rows = ["1", "5", "10", "20"].map((v) => coin({ symbol: `P${v}`, priceUsd: v }));

    const kept = applyScreener(rows, bounded("price", { min: "5", max: "10" }), "24h");

    expect(kept.map((t) => t.symbol)).toEqual(["P5", "P10"]);
  });

  // Compared as decimals, not as strings or floats: "9" is more than "10" to a
  // string sort, and 0.1 + 0.2 is not 0.3 to a float.
  it("compares by value rather than lexically", () => {
    const rows = [coin({ symbol: "NINE", priceUsd: "9" }), coin({ symbol: "TEN", priceUsd: "10" })];

    const kept = applyScreener(rows, bounded("price", { max: "9.5" }), "24h");

    expect(kept.map((t) => t.symbol)).toEqual(["NINE"]);
  });

  it("sorts descending, and ascending, by the chosen metric", () => {
    const rows = [
      coin({ symbol: "MID", liquidityUsd: "500" }),
      coin({ symbol: "TOP", liquidityUsd: "9000" }),
      coin({ symbol: "LOW", liquidityUsd: "10" }),
    ];
    const sorted = (order: SortOrder) =>
      applyScreener(rows, { bounds: {}, sort: { by: "liquidity", order } }, "24h").map(
        (t) => t.symbol
      );

    expect(sorted("desc")).toEqual(["TOP", "MID", "LOW"]);
    expect(sorted("asc")).toEqual(["LOW", "MID", "TOP"]);
  });

  // A coin the service cannot measure is not the smallest one. Ascending order
  // must not open with a wall of unknowns.
  it("puts unreadable values last in both directions", () => {
    const rows = [
      coin({ symbol: "NONE", liquidityUsd: null }),
      coin({ symbol: "TOP", liquidityUsd: "9000" }),
      coin({ symbol: "LOW", liquidityUsd: "10" }),
    ];
    const sorted = (order: SortOrder) =>
      applyScreener(rows, { bounds: {}, sort: { by: "liquidity", order } }, "24h").map(
        (t) => t.symbol
      );

    expect(sorted("desc")).toEqual(["TOP", "LOW", "NONE"]);
    expect(sorted("asc")).toEqual(["LOW", "TOP", "NONE"]);
  });

  it("holds the backend's order for equal values", () => {
    const rows = ["A", "B", "C"].map((symbol) => coin({ symbol, liquidityUsd: "100" }));

    const sorted = applyScreener(
      rows,
      { bounds: {}, sort: { by: "liquidity", order: "desc" } },
      "24h"
    );

    expect(sorted.map((t) => t.symbol)).toEqual(["A", "B", "C"]);
  });

  // Idempotent by construction: the same predicate over a list the backend has
  // already filtered changes nothing, so this is correct both before and after
  // the service starts honouring the query, with no feature detection.
  it("passes an already-filtered list through untouched", () => {
    const rows = [
      coin({ symbol: "A", marketCapUsd: "10" }),
      coin({ symbol: "B", marketCapUsd: "20" }),
    ];
    const filters = bounded("marketCap", { max: "1000000" });

    const once = applyScreener(rows, filters, "24h");
    const twice = applyScreener(once, filters, "24h");

    expect(twice.map((t) => t.symbol)).toEqual(["A", "B"]);
  });

  it("leaves the list exactly as it came when nothing is applied", () => {
    const rows = [coin({ symbol: "A" }), coin({ symbol: "B" })];

    expect(applyScreener(rows, EMPTY_FILTERS, "24h")).toBe(rows);
  });

  // Windowed metrics read the chosen window, so the same coin can pass at 1h
  // and fail at 24h.
  it("reads a windowed metric from the selected timeframe", () => {
    const token = coin({
      activity: {
        "1h": { volumeUsd: "50000", transactions: 10, traders: 5, priceChangePercent: "1" },
        "24h": { volumeUsd: "100", transactions: 1, traders: 1, priceChangePercent: "1" },
      },
    } as Partial<MemeToken>);
    const filters = bounded("volume", { min: "1000" });

    expect(applyScreener([token], filters, "1h")).toHaveLength(1);
    expect(applyScreener([token], filters, "24h")).toHaveLength(0);
  });
});
