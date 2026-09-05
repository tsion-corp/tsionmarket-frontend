import { describe, expect, it } from "vitest";
import { tradingViewFallbackSymbol, tradingViewSymbol } from "@/lib/perp/tradingview";
import type { PerpCategory, PerpPair } from "@/lib/perp/types";

function pair(from: string, category: PerpCategory): PerpPair {
  return {
    pairIndex: 0,
    from,
    to: "USD",
    groupIndex: 0,
    group: "X",
    category,
    feeIndex: 0,
    maxLeverage: 50,
    minPositionUsdc: "100",
    spread: { min: 0, max: 0 },
    maxLongOiP: 0,
    maxShortOiP: 0,
  };
}

describe("tradingViewSymbol", () => {
  it("charts crypto on Coinbase, with venue overrides where Coinbase lacks it", () => {
    expect(tradingViewSymbol(pair("ETH", "crypto"))).toBe("COINBASE:ETHUSD");
    expect(tradingViewSymbol(pair("AERO", "crypto"))).toBe("COINBASE:AEROUSD");
    expect(tradingViewSymbol(pair("APT", "crypto"))).toBe("COINBASE:APTUSD");
    expect(tradingViewSymbol(pair("JUP", "crypto"))).toBe("OKX:JUPUSD");
    expect(tradingViewSymbol(pair("XMR", "crypto"))).toBe("CRYPTO:XMRUSD");
    expect(tradingViewSymbol(pair("BRETT", "crypto"))).toBe("PYTH:BRETTUSD");
  });

  it("routes forex majors to FXCM and exotics to the IDC composite", () => {
    expect(tradingViewSymbol(pair("EUR", "forex"))).toBe("FX:EURUSD");
    const jpy = { ...pair("USD", "forex"), to: "JPY" };
    expect(tradingViewSymbol(jpy)).toBe("FX:USDJPY");
    const krw = { ...pair("USD", "forex"), to: "KRW" };
    expect(tradingViewSymbol(krw)).toBe("FX_IDC:USDKRW");
  });

  it("maps commodities to their venue symbols", () => {
    expect(tradingViewSymbol(pair("XAU", "commodities"))).toBe("OANDA:XAUUSD");
    expect(tradingViewSymbol(pair("WTI", "commodities"))).toBe("TVC:USOIL");
    expect(tradingViewSymbol(pair("USOILSPOT", "commodities"))).toBe("TVC:USOIL");
    expect(tradingViewSymbol(pair("BRENT", "commodities"))).toBe("TVC:UKOIL");
  });

  it("maps index perps to the underlying index and stocks to their venue", () => {
    expect(tradingViewSymbol(pair("US500", "equities"))).toBe("SP:SPX");
    expect(tradingViewSymbol(pair("US100", "equities"))).toBe("NASDAQ:NDX");
    expect(tradingViewSymbol(pair("NVDA", "equities"))).toBe("NASDAQ:NVDA");
    expect(tradingViewSymbol(pair("BABA", "equities"))).toBe("NYSE:BABA");
    expect(tradingViewSymbol(pair("SK HYNIX", "equities"))).toBe("KRX:000660");
  });

  it("falls back to a crypto venue before pair config loads", () => {
    expect(tradingViewFallbackSymbol("BTC")).toBe("COINBASE:BTCUSD");
  });
});
