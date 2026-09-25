import { describe, expect, it } from "vitest";
import {
  ariaSortFor,
  columnFigure,
  memeColumns,
  metricColumnFor,
  nextSortFor,
  type MemeColumn,
} from "@/features/trade/components/meme-table-columns";
import { memeToken } from "@/lib/meme/fixture";

const column = (id: MemeColumn["id"], sortsBy: MemeColumn["sortsBy"]): MemeColumn => ({
  id,
  sortsBy,
  numeric: id !== "asset",
});

describe("the desk table's columns", () => {
  it("draws four columns when nothing extra is sorted", () => {
    expect(memeColumns(null).map((c) => c.id)).toEqual(["asset", "price", "change", "marketCap"]);
  });

  it("appends the metric column for a sort the table does not already show", () => {
    expect(memeColumns("liquidity").map((c) => c.id)).toEqual([
      "asset",
      "price",
      "change",
      "marketCap",
      "metric",
    ]);
  });

  // Price and market cap have columns of their own; a fifth showing the same
  // figure twice is the bug this guards.
  it("adds no extra column for a metric already on screen", () => {
    expect(metricColumnFor("price")).toBeNull();
    expect(metricColumnFor("marketCap")).toBeNull();
    expect(metricColumnFor("liquidity")).toBe("liquidity");
    expect(metricColumnFor(null)).toBeNull();
  });
});

describe("the figure a column draws", () => {
  const NOW = Date.parse("2026-09-16T12:00:00.000Z");
  const token = memeToken({
    symbol: "PEPE",
    priceUsd: "0.00000001234",
    marketCapUsd: "3491589227.12",
    liquidityUsd: "84200",
    pairCreatedAt: new Date(NOW - 90 * 60_000).toISOString(),
    activity: {
      "1h": {
        volumeUsd: "12400000",
        transactions: 1284339,
        traders: 4200,
        priceChangePercent: "12345.67",
      },
    },
  });

  it("names each fixed column's figure and where it came from", () => {
    expect(columnFigure(column("asset", null), token, "1h", NOW)).toEqual({ kind: "identity" });
    expect(columnFigure(column("price", "price"), token, "1h", NOW)).toEqual({
      kind: "price",
      value: "0.00000001234",
    });
    expect(columnFigure(column("marketCap", "marketCap"), token, "1h", NOW)).toEqual({
      kind: "usd",
      value: "3491589227.12",
    });
  });

  // The change column has no screener bound of its own; it reads the window
  // the strip above it is showing.
  it("reads the change from the selected window", () => {
    expect(columnFigure(column("change", null), token, "1h", NOW)).toEqual({
      kind: "percent",
      value: "12345.67",
    });
  });

  it("hands the metric column its own sorted metric", () => {
    expect(columnFigure(column("metric", "liquidity"), token, "1h", NOW)).toEqual({
      kind: "usd",
      value: "84200",
    });
    expect(columnFigure(column("metric", "transactions"), token, "1h", NOW)).toEqual({
      kind: "count",
      value: 1284339,
    });
    expect(columnFigure(column("metric", "age"), token, "1h", NOW)).toEqual({
      kind: "age",
      minutes: 90,
    });
  });
});

describe("clicking a heading", () => {
  // The first question asked of a screener is which is the biggest, so a fresh
  // column opens descending.
  it("starts a new column descending", () => {
    expect(nextSortFor(column("marketCap", "marketCap"), null)).toEqual({
      by: "marketCap",
      order: "desc",
    });
    expect(nextSortFor(column("price", "price"), { by: "marketCap", order: "asc" })).toEqual({
      by: "price",
      order: "desc",
    });
  });

  it("flips the column already sorted", () => {
    expect(nextSortFor(column("price", "price"), { by: "price", order: "desc" })).toEqual({
      by: "price",
      order: "asc",
    });
  });

  // A third click clears it. Cycling back to descending would leave no way to
  // undo a sort from the heading at all.
  it("clears the sort on the third click rather than cycling", () => {
    expect(nextSortFor(column("price", "price"), { by: "price", order: "asc" })).toBeNull();
  });

  it("leaves the sort alone for a column that cannot sort", () => {
    const current = { by: "price" as const, order: "desc" as const };
    expect(nextSortFor(column("asset", null), current)).toBe(current);
    expect(nextSortFor(column("change", null), current)).toBe(current);
  });
});

describe("announcing the sort", () => {
  it("reports the direction on the sorted column and none on the others", () => {
    const current = { by: "price" as const, order: "asc" as const };
    expect(ariaSortFor(column("price", "price"), current)).toBe("ascending");
    expect(ariaSortFor(column("marketCap", "marketCap"), current)).toBe("none");
  });

  // A column that cannot sort carries no aria-sort at all, rather than "none",
  // which would announce it as an unsorted sortable column.
  it("says nothing for a column that cannot sort", () => {
    expect(ariaSortFor(column("asset", null), null)).toBeUndefined();
  });
});
