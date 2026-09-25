import { describe, expect, it } from "vitest";
import { rankableHere, type Paged } from "@/lib/meme/catalog";
import { memeToken } from "@/lib/meme/fixture";
import type { MemeToken } from "@/lib/meme/types";

// The strip's promise is "Hottest coins over 24h". On 2026-09-16 the trade
// service answered /tokens/trending with 40 rows of which 35 carried no price
// and no 24h change at all, so the top cards on production rendered as a name
// over two dashes. A row with nothing to rank by cannot be one of the hottest
// coins, whatever position the service returned it in.

// A trending row as the board receives it: the figures the card reads, and
// nothing assumed. `change` goes in the activity block, which is where the
// trending route puts it; `flatChange` is the older top-level field, which is
// what the catalogue rows the board falls back to carry.
function row(
  symbol: string,
  priceUsd: string | null,
  change: string | null,
  flatChange: string | null = null
): MemeToken {
  return memeToken({
    symbol,
    priceUsd,
    priceChange24hPercent: flatChange,
    riskLevel: "UNKNOWN",
    activity: {
      "24h": { volumeUsd: "1", transactions: 1, traders: 1, priceChangePercent: change },
    },
  });
}

const page = (items: MemeToken[]): Paged<MemeToken> => ({
  items,
  meta: { page: 1, limit: 40, total: items.length },
});

const symbols = (items: MemeToken[]) => items.map((token) => token.symbol);

describe("rankableHere", () => {
  it("drops a row with neither a price nor a change", () => {
    const shown = rankableHere(
      page([row("SGETH", null, null), row("MENTE", "0.0166", "-0.09"), row("INK", null, null)]),
      "all"
    );

    expect(symbols(shown.items)).toEqual(["MENTE"]);
  });

  it("keeps the order the service ranked them in", () => {
    const shown = rankableHere(
      page([
        row("GDTY", "0.0001", "29.02"),
        row("BLANK", null, null),
        row("GG", "0.0000027", "-12.42"),
      ]),
      "all"
    );

    expect(symbols(shown.items)).toEqual(["GDTY", "GG"]);
  });

  // A change the parser already refused as impossible arrives here as null, so
  // a row carrying only a price is still worth a card: the price is real and
  // the strip shows a dash where the change would be.
  it("keeps a row that has a price but no change", () => {
    const shown = rankableHere(page([row("GSI", "0.0000097", null)]), "all");
    expect(symbols(shown.items)).toEqual(["GSI"]);
  });

  it("keeps a row that has a change but no price yet", () => {
    const shown = rankableHere(page([row("NEW", null, "12.5")]), "all");
    expect(symbols(shown.items)).toEqual(["NEW"]);
  });

  // changeFor falls back to the top-level 24h field when the activity block is
  // missing that window, so the card would draw a figure for this row and the
  // strip must not throw it away first.
  it("keeps a row whose only 24h change is the top-level field", () => {
    const flat = memeToken({ symbol: "FLAT", priceUsd: null, priceChange24hPercent: "8.1" });
    expect(symbols(rankableHere(page([flat]), "all").items)).toEqual(["FLAT"]);
  });

  it("still applies the discovery view", () => {
    // Curated admits only rated rows, so an UNKNOWN one with both figures is
    // filtered by the view before rankability is ever considered.
    const unrated = row("MENTE", "0.0166", "-0.09");
    expect(rankableHere(page([unrated]), "curated").items).toEqual([]);
    expect(symbols(rankableHere(page([unrated]), "all").items)).toEqual(["MENTE"]);
  });

  it("reports how many it is showing and passes the server's meta through", () => {
    const shown = rankableHere(page([row("A", "1", "2"), row("B", null, null)]), "all");
    expect(shown.shownCount).toBe(shown.items.length);
    expect(shown.shownCount).toBe(1);
    expect(shown.meta).toEqual({ page: 1, limit: 40, total: 2 });
  });

  // The feed as production served it: 35 shells ranked above 5 real coins. The
  // strip deals three cards a page, so without this filter all three came off
  // the shells and the real coins sat on page 12.
  it("fills the first page of three from the rows that have figures", () => {
    const shells = Array.from({ length: 35 }, (_, i) => row(`SHELL${i}`, null, null));
    const real = ["MENTE", "GDTY", "GG", "GSI", "NEW"].map((symbol, i) =>
      row(symbol, `0.000${i + 1}`, `${i + 1}.5`)
    );
    const shown = rankableHere(page([...shells, ...real]), "all");

    expect(symbols(shown.items)).toEqual(["MENTE", "GDTY", "GG", "GSI", "NEW"]);
    expect(symbols(shown.items.slice(0, 3))).toEqual(["MENTE", "GDTY", "GG"]);
  });

  // The board can be answered by a slice of the Base catalogue instead of the
  // ranking. Those rows carry prices, so the filter takes none of them away.
  it("keeps every row of a catalogue fallback slice", () => {
    const slice = Array.from({ length: 40 }, (_, i) =>
      memeToken({ symbol: `BASE${i}`, priceUsd: `${i + 1}`, priceChange24hPercent: null })
    );
    const shown = rankableHere(page(slice), "all");

    expect(shown.items).toHaveLength(40);
    expect(shown.shownCount).toBe(40);
  });
});
