import { describe, expect, it } from "vitest";
import { parsePriceFrame, priceTopic, subscribeMessage } from "@/lib/perp/stream";

describe("priceTopic", () => {
  it("lowercases and swaps the slash per the gateway contract", () => {
    expect(priceTopic("ETH/USD")).toBe("perp:price:eth-usd");
    expect(priceTopic("EUR/USD")).toBe("perp:price:eur-usd");
    expect(priceTopic("XAU/USD")).toBe("perp:price:xau-usd");
  });
});

describe("subscribeMessage", () => {
  it("builds the subscribe control frame", () => {
    expect(JSON.parse(subscribeMessage(["ETH/USD", "BTC/USD"]))).toEqual({
      type: "subscribe",
      topics: ["perp:price:eth-usd", "perp:price:btc-usd"],
    });
  });
});

describe("parsePriceFrame", () => {
  const frame = (data: unknown) => JSON.stringify({ type: "price", data, timestamp: 1 });

  it("accepts a well-formed price frame", () => {
    expect(
      parsePriceFrame(frame({ pair: "ETH/USD", price: "1917.30", publishTime: 1785402981 }))
    ).toEqual({ pair: "ETH/USD", price: "1917.30", publishTime: 1785402981 });
  });

  it("ignores control frames", () => {
    expect(parsePriceFrame(JSON.stringify({ type: "welcome", data: { ok: true } }))).toBeNull();
    expect(
      parsePriceFrame(JSON.stringify({ type: "subscribed", data: { topics: [] } }))
    ).toBeNull();
  });

  it("drops malformed frames instead of throwing", () => {
    expect(parsePriceFrame("not json")).toBeNull();
    expect(parsePriceFrame(12)).toBeNull();
    expect(parsePriceFrame(frame(null))).toBeNull();
    expect(parsePriceFrame(frame({ pair: "", price: "1", publishTime: 1 }))).toBeNull();
    // Prices must stay decimal strings; a numeric price is a contract break.
    expect(parsePriceFrame(frame({ pair: "ETH/USD", price: 1917.3, publishTime: 1 }))).toBeNull();
    expect(parsePriceFrame(frame({ pair: "ETH/USD", price: "-5", publishTime: 1 }))).toBeNull();
    expect(parsePriceFrame(frame({ pair: "ETH/USD", price: "1", publishTime: "x" }))).toBeNull();
  });
});
