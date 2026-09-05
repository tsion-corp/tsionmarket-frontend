import { describe, expect, it } from "vitest";
import { tradingViewSymbolForAsset } from "./hyperliquid-tradingview";

describe("tradingViewSymbolForAsset", () => {
  it("maps native crypto majors to the Coinbase USD pair", () => {
    expect(tradingViewSymbolForAsset("BTC")).toBe("COINBASE:BTCUSD");
    expect(tradingViewSymbolForAsset("ETH", "crypto")).toBe("COINBASE:ETHUSD");
  });

  it("uses the per-asset venue override where Coinbase has no chart", () => {
    expect(tradingViewSymbolForAsset("JUP")).toBe("OKX:JUPUSD");
    expect(tradingViewSymbolForAsset("XMR")).toBe("CRYPTO:XMRUSD");
  });

  it("unwraps Hyperliquid's k-prefixed 1000x listings", () => {
    expect(tradingViewSymbolForAsset("kPEPE")).toBe("COINBASE:PEPEUSD");
  });

  it("strips the HIP-3 dex prefix instead of producing COINBASE:xyz:AAPLUSD", () => {
    // The exact bug: every equities/forex/commodities chart rendered blank
    // because the wire-form symbol went into the venue template verbatim.
    expect(tradingViewSymbolForAsset("xyz:AAPL", "equities")).toBe("AAPL");
    expect(tradingViewSymbolForAsset("xyz:US500", "indices")).toBe("US500");
  });

  it("passes non-crypto bases to TradingView bare for its own venue resolution", () => {
    expect(tradingViewSymbolForAsset("AAPL", "equities")).toBe("AAPL");
    expect(tradingViewSymbolForAsset("XAUUSD", "commodities")).toBe("XAUUSD");
  });

  it("still treats an unknown/missing category as crypto (the pre-HIP-3 behavior)", () => {
    expect(tradingViewSymbolForAsset("BTC", null)).toBe("COINBASE:BTCUSD");
    expect(tradingViewSymbolForAsset("BTC", undefined)).toBe("COINBASE:BTCUSD");
  });
});
