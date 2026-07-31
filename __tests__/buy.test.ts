import { describe, expect, it } from "vitest";
import {
  BUY_ORIGIN,
  DEFAULT_BUY_CHAIN_ID,
  buyableSymbols,
  defaultRouteForSymbol,
  isBuyable,
  isOfferable,
  routesForSymbol,
  sortRoutes,
  type BuyRoute,
} from "@/lib/buy";

const BASE = DEFAULT_BUY_CHAIN_ID; // 8453
const ARBITRUM = 42161;
const POLYGON = 137;
const SOLANA = 792703809;
const BITCOIN = 8253038;
const XRP = 1440000;

function route(overrides: Partial<BuyRoute>): BuyRoute {
  return {
    destinationChainId: BASE,
    chainName: "Base",
    asset: "0xtoken",
    symbol: "ETH",
    decimals: 18,
    logoUrl: null,
    ...overrides,
  };
}

const SOL_MINT = "So11111111111111111111111111111111111111112";

// ETH on three chains, USDT on two, cbBTC on Base, WIF on Solana (an SPL token),
// SOL on both Solana (native, which Dextopus can't deliver) and Base (a wrapped
// ERC-20), plus BTC and XRP that only route to chains we hold no wallet for.
const DESTINATIONS: BuyRoute[] = [
  route({ symbol: "ETH", destinationChainId: ARBITRUM, chainName: "Arbitrum" }),
  route({ symbol: "ETH", destinationChainId: BASE, chainName: "Base" }),
  route({ symbol: "ETH", destinationChainId: POLYGON, chainName: "Polygon" }),
  route({ symbol: "USDT", destinationChainId: POLYGON, chainName: "Polygon", decimals: 6 }),
  route({ symbol: "USDT", destinationChainId: ARBITRUM, chainName: "Arbitrum", decimals: 6 }),
  route({ symbol: "cbBTC", destinationChainId: BASE, chainName: "Base", decimals: 8 }),
  route({ symbol: "WIF", destinationChainId: SOLANA, chainName: "solana", decimals: 6 }),
  route({
    symbol: "SOL",
    destinationChainId: SOLANA,
    chainName: "solana",
    decimals: 9,
    asset: SOL_MINT,
  }),
  route({
    symbol: "SOL",
    destinationChainId: BASE,
    chainName: "Base",
    decimals: 9,
    asset: "0x3119",
  }),
  route({ symbol: "BTC", destinationChainId: BITCOIN, chainName: "bitcoin", decimals: 8 }),
  route({ symbol: "XRP", destinationChainId: XRP, chainName: "xrp", decimals: 6 }),
];

describe("BUY_ORIGIN", () => {
  it("is USDC on Base with 6 decimals", () => {
    expect(BUY_ORIGIN.chainId).toBe(8453);
    expect(BUY_ORIGIN.decimals).toBe(6);
    expect(BUY_ORIGIN.asset.toLowerCase()).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  });
});

describe("isOfferable", () => {
  it("allows supported chains (EVM and Solana)", () => {
    expect(isOfferable(route({ chainName: "Ethereum", destinationChainId: 1 }))).toBe(true);
    expect(isOfferable(route({ chainName: "Arbitrum", destinationChainId: ARBITRUM }))).toBe(true);
    expect(
      isOfferable(route({ symbol: "WIF", chainName: "solana", destinationChainId: SOLANA }))
    ).toBe(true);
  });

  it("rejects unsupported chains and ones we hold no wallet for", () => {
    expect(isOfferable(route({ symbol: "BNB", chainName: "bsc", destinationChainId: 56 }))).toBe(
      false
    );
    expect(
      isOfferable(route({ symbol: "BTC", chainName: "bitcoin", destinationChainId: BITCOIN }))
    ).toBe(false);
    expect(isOfferable(route({ symbol: "XRP", chainName: "xrp", destinationChainId: XRP }))).toBe(
      false
    );
  });

  it("rejects native SOL (undeliverable) and the Base wrapper", () => {
    expect(isOfferable(route({ symbol: "SOL", chainName: "Base", destinationChainId: BASE }))).toBe(
      false
    );
    expect(
      isOfferable(
        route({ symbol: "SOL", chainName: "solana", destinationChainId: SOLANA, asset: SOL_MINT })
      )
    ).toBe(false);
  });
});

describe("routesForSymbol", () => {
  it("returns every deliverable chain for a symbol, Base first", () => {
    const routes = routesForSymbol(DESTINATIONS, "ETH");
    expect(routes.map((r) => r.chainName)).toEqual(["Base", "Arbitrum", "Polygon"]);
  });

  it("orders non-Base chains alphabetically when Base is absent", () => {
    const routes = routesForSymbol(DESTINATIONS, "USDT");
    expect(routes.map((r) => r.chainName)).toEqual(["Arbitrum", "Polygon"]);
  });

  it("offers nothing for SOL: native SOL is undeliverable and the Base one is wrapped", () => {
    expect(routesForSymbol(DESTINATIONS, "SOL")).toEqual([]);
  });

  it("resolves BTC through its alias to cbBTC on Base", () => {
    const routes = routesForSymbol(DESTINATIONS, "BTC");
    expect(routes).toHaveLength(1);
    expect(routes[0].chainName).toBe("Base");
    expect(routes[0].symbol).toBe("cbBTC");
  });

  it("offers nothing for a coin that only routes to a non-deliverable chain", () => {
    expect(routesForSymbol(DESTINATIONS, "XRP")).toEqual([]);
  });

  it("returns a single route for a symbol tied to one chain", () => {
    const routes = routesForSymbol(DESTINATIONS, "WIF");
    expect(routes).toHaveLength(1);
    expect(routes[0].destinationChainId).toBe(SOLANA);
  });

  it("returns nothing for an unknown symbol", () => {
    expect(routesForSymbol(DESTINATIONS, "DOGE")).toEqual([]);
  });
});

describe("defaultRouteForSymbol", () => {
  it("picks Base when the symbol is on several chains", () => {
    expect(defaultRouteForSymbol(DESTINATIONS, "ETH")?.destinationChainId).toBe(BASE);
  });

  it("picks the only chain for a single-chain symbol", () => {
    expect(defaultRouteForSymbol(DESTINATIONS, "cbBTC")?.destinationChainId).toBe(BASE);
    expect(defaultRouteForSymbol(DESTINATIONS, "WIF")?.destinationChainId).toBe(SOLANA);
  });

  it("is null for a non-offerable symbol", () => {
    expect(defaultRouteForSymbol(DESTINATIONS, "XRP")).toBeNull();
    expect(defaultRouteForSymbol(DESTINATIONS, "SOL")).toBeNull();
  });
});

describe("buyableSymbols / isBuyable", () => {
  it("collects offerable symbols by display ticker (cbBTC surfaces as BTC)", () => {
    expect(buyableSymbols(DESTINATIONS)).toEqual(new Set(["ETH", "USDT", "BTC", "WIF"]));
  });

  it("reports buyability, resolving aliases and excluding undeliverable assets", () => {
    expect(isBuyable(DESTINATIONS, "eth")).toBe(true);
    expect(isBuyable(DESTINATIONS, "BTC")).toBe(true);
    expect(isBuyable(DESTINATIONS, "WIF")).toBe(true);
    expect(isBuyable(DESTINATIONS, "SOL")).toBe(false);
    expect(isBuyable(DESTINATIONS, "XRP")).toBe(false);
    expect(isBuyable(DESTINATIONS, "DOGE")).toBe(false);
  });
});

describe("sortRoutes", () => {
  it("does not mutate its input", () => {
    const input = [
      route({ destinationChainId: POLYGON, chainName: "Polygon" }),
      route({ destinationChainId: BASE, chainName: "Base" }),
    ];
    const before = input.map((r) => r.chainName);
    sortRoutes(input);
    expect(input.map((r) => r.chainName)).toEqual(before);
  });
});
