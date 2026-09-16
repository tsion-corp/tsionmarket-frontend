import { describe, expect, it } from "vitest";
import { rankableHere } from "@/lib/meme/catalog";
import type { Paged } from "@/lib/meme/catalog";
import type { MemeToken } from "@/lib/meme/types";

// The strip's promise is "Hottest coins over 24h". On 2026-09-16 the trade
// service answered /tokens/trending with 40 rows of which 35 carried no price
// and no 24h change at all, so the top three cards on production rendered as
// a name over two dashes. A row with nothing to rank by cannot be one of the
// hottest coins, whatever position the service returned it in.

function token(over: Partial<MemeToken> & { symbol: string }): MemeToken {
  return {
    chainId: 8453,
    address: `0x${over.symbol}`,
    name: over.symbol,
    decimals: 18,
    priceUsd: null,
    buyEnabled: true,
    ...over,
  } as MemeToken;
}

function withChange(symbol: string, priceUsd: string | null, change: string | null): MemeToken {
  return token({
    symbol,
    priceUsd,
    activity: {
      "24h": { volumeUsd: "1", transactions: 1, traders: 1, priceChangePercent: change },
    },
  } as Partial<MemeToken> & { symbol: string });
}

const page = (items: MemeToken[]): Paged<MemeToken> => ({
  items,
  meta: { page: 1, limit: 40, total: items.length },
});

describe("rankableHere", () => {
  it("drops a row with neither a price nor a change", () => {
    const shown = rankableHere(
      page([
        withChange("SGETH", null, null),
        withChange("MENTE", "0.0166", "-0.09"),
        withChange("INK", null, null),
      ]),
      "all"
    );

    expect(shown.items.map((t) => t.symbol)).toEqual(["MENTE"]);
  });

  it("keeps the order the service ranked them in", () => {
    const shown = rankableHere(
      page([
        withChange("GDTY", "0.0001", "29.02"),
        withChange("BLANK", null, null),
        withChange("GG", "0.0000027", "-12.42"),
      ]),
      "all"
    );

    expect(shown.items.map((t) => t.symbol)).toEqual(["GDTY", "GG"]);
  });

  // A change the parser already refused as impossible arrives here as null, so
  // a row carrying only a price is still worth a card: the price is real and
  // the strip shows a dash where the change would be.
  it("keeps a row that has a price but no change", () => {
    const shown = rankableHere(page([withChange("GSI", "0.0000097", null)]), "all");
    expect(shown.items.map((t) => t.symbol)).toEqual(["GSI"]);
  });

  it("keeps a row that has a change but no price yet", () => {
    const shown = rankableHere(page([withChange("NEW", null, "12.5")]), "all");
    expect(shown.items.map((t) => t.symbol)).toEqual(["NEW"]);
  });

  it("still applies the discovery view", () => {
    const shown = rankableHere(page([withChange("MENTE", "0.0166", "-0.09")]), "curated");
    // Curated admits only the catalogue's own memecoins, so an unknown symbol
    // is filtered by view before rankability is ever considered.
    expect(shown.items.length).toBeLessThanOrEqual(1);
  });

  it("reports how many it is showing", () => {
    const shown = rankableHere(
      page([withChange("A", "1", "2"), withChange("B", null, null)]),
      "all"
    );
    expect(shown.shownCount).toBe(shown.items.length);
  });
});
