import { describe, expect, it } from "vitest";
import { spotSymbolsFor, SPOT_DELISTED } from "@/lib/spot-markets";
import type { BuyRoute } from "@/lib/buy";

function route(symbol: string, chainName: string, destinationChainId: number): BuyRoute {
  return {
    destinationChainId,
    chainName,
    asset: `0x${symbol.toLowerCase().padEnd(40, "0")}`,
    symbol,
    decimals: 18,
    logoUrl: null,
  };
}

// Requested off the spot desk on 2026-09-07: DOGE (a same-chain swap route,
// not a Dextopus destination), RON (Ronin's native coin) and MON (Monad's).
// They come off the BUY list only: holdings of them stay visible and sell
// through the same Dextopus route as before.
describe("spotSymbolsFor: delisted markets", () => {
  const destinations = [
    route("ETH", "base", 8453),
    route("RON", "ronin", 2020),
    route("MON", "monad", 143),
    route("USDC", "base", 8453),
  ];

  it("names the delisted symbols", () => {
    expect([...SPOT_DELISTED].sort()).toEqual([
      "DEGEN",
      "DOGE",
      "GUN",
      "MON",
      "PLUME",
      "RON",
      "XDAI",
    ]);
  });

  // Second batch, 2026-09-07 16:29: GUN (Avalanche and GUNZ), xDAI (Gnosis
  // native), PLUME (Ethereum and Plume), and three stablecoin variants the
  // stable filter did not yet know: USDT0, USDC.e, USDzC.
  it("drops the second batch and the stablecoin variants", () => {
    const symbols = spotSymbolsFor([
      route("ETH", "base", 8453),
      route("GUN", "avalanche", 43114),
      route("xDAI", "gnosis", 100),
      route("PLUME", "ethereum", 1),
      route("USDT0", "ink", 57073),
      route("USDC.e", "polygon", 137),
      route("USDzC", "zora", 7777777),
    ]);
    expect(symbols).toEqual(["ETH"]);
  });

  it("drops DOGE, RON and MON and keeps everything else buyable", () => {
    const symbols = spotSymbolsFor(destinations);
    expect(symbols).toContain("ETH");
    expect(symbols).not.toContain("DOGE");
    expect(symbols).not.toContain("RON");
    expect(symbols).not.toContain("MON");
    // Stablecoins were already excluded from the spot list.
    expect(symbols).not.toContain("USDC");
  });
});
