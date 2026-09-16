import { describe, expect, it } from "vitest";
import { composePerpBrief, parsePerpBriefAssets, parsePerpBriefContexts } from "@/lib/perp/brief";

const asset = (symbol: string, maxLeverage: number, extra: object = {}) => ({
  id: symbol,
  assetIndex: 0,
  dex: "",
  symbol,
  category: "crypto",
  szDecimals: 4,
  maxLeverage,
  isActive: true,
  ...extra,
});

const context = (symbol: string, markPrice: string) => ({
  symbol,
  markPrice,
  oraclePrice: markPrice,
  prevDayPrice: markPrice,
  dayVolumeUsd: "1",
  openInterest: "1",
  fundingRate: "0",
});

describe("composePerpBrief", () => {
  it("lists the majors the desk lists, with the live mark and the venue's leverage", () => {
    const rows = composePerpBrief(
      [asset("ETH", 25), asset("BTC", 40), asset("SOL", 20)],
      [context("BTC", "112000.5"), context("ETH", "4300"), context("SOL", "210")],
      {},
      2
    );
    expect(rows).toEqual([
      { symbol: "BTC/USD", base: "BTC", priceUsd: 112000.5, maxLeverage: 40 },
      { symbol: "ETH/USD", base: "ETH", priceUsd: 4300, maxLeverage: 25 },
    ]);
  });

  it("skips a major the venue does not list, is not trading, or lists only on a HIP-3 dex", () => {
    const rows = composePerpBrief(
      [
        asset("BTC", 40, { isActive: false }),
        asset("ETH", 25, { dex: "xyz" }),
        asset("SOL", 20),
        asset("DOGE", 10),
      ],
      [],
      { SOL: 200, DOGE: 0.2 },
      2
    );
    expect(rows.map((r) => r.symbol)).toEqual(["SOL/USD", "DOGE/USD"]);
  });

  it("prices from the app's own feed when the mark is missing or unusable", () => {
    const rows = composePerpBrief(
      [asset("BTC", 40), asset("ETH", 25)],
      [context("ETH", "not-a-price")],
      { BTC: 111000, ETH: 4200 },
      2
    );
    expect(rows.map((r) => r.priceUsd)).toEqual([111000, 4200]);
  });

  it("leaves the price at zero when nothing prices it, so the row shows a dash", () => {
    const [row] = composePerpBrief([asset("BTC", 40)], [], {}, 1);
    expect(row.priceUsd).toBe(0);
  });
});

describe("parsing the perp service's rows", () => {
  it("accepts the service's asset and context rows", () => {
    expect(parsePerpBriefAssets([asset("BTC", 40)])).toHaveLength(1);
    expect(parsePerpBriefContexts([context("BTC", "1")])).toHaveLength(1);
  });

  it("rejects a payload that no longer matches the contract", () => {
    expect(() => parsePerpBriefAssets([{ symbol: "BTC" }])).toThrow();
    expect(() => parsePerpBriefContexts({ BTC: "1" })).toThrow();
  });
});
