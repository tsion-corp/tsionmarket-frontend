import { describe, expect, it } from "vitest";
import { parseCashtags } from "@/lib/square/cashtags";

const TRADEABLE = ["BTC", "ETH", "SOL"];

function tags(text: string, tradeable = TRADEABLE) {
  return parseCashtags(text, tradeable)
    .filter((segment) => segment.kind === "cashtag")
    .map((segment) => segment.symbol);
}

function rebuilt(text: string, tradeable = TRADEABLE) {
  return parseCashtags(text, tradeable)
    .map((segment) => segment.value)
    .join("");
}

describe("parseCashtags", () => {
  it("marks up a tradeable ticker and leaves the rest as text", () => {
    expect(tags("loading up on $BTC today")).toEqual(["BTC"]);
  });

  // The rule that keeps the chip honest: no listing, no chip.
  it("leaves an untradeable ticker as plain text", () => {
    expect(tags("$DOGE to the moon")).toEqual([]);
    expect(tags("$DOGE to the moon")).not.toContain("DOGE");
  });

  it("matches case-insensitively but keeps what the author typed", () => {
    const segments = parseCashtags("watching $btc and $Eth", TRADEABLE);
    expect(segments.filter((s) => s.kind === "cashtag")).toEqual([
      { kind: "cashtag", value: "$btc", symbol: "BTC" },
      { kind: "cashtag", value: "$Eth", symbol: "ETH" },
    ]);
  });

  it("never loses or duplicates a character of the original text", () => {
    for (const text of [
      "loading up on $BTC today",
      "$BTC",
      "$BTC and $ETH and $SOL",
      "no tickers here at all",
      "",
      "trailing $SOL",
      "$DOGE is not listed but $BTC is",
    ]) {
      expect(rebuilt(text), text).toBe(text);
    }
  });

  it("does not mistake a price or an email for a ticker", () => {
    expect(tags("it cost US$BTC")).toEqual([]);
    expect(tags("mail me at a$BTC.com")).toEqual([]);
  });

  it("requires at least two characters and stops at a word boundary", () => {
    expect(tags("$B is too short", ["B"])).toEqual([]);
    expect(tags("$BTCUSDT is a pair, not our symbol")).toEqual([]);
  });

  it("handles a ticker at the very start and the very end", () => {
    expect(tags("$BTC leads")).toEqual(["BTC"]);
    expect(tags("ending on $ETH")).toEqual(["ETH"]);
  });
});
