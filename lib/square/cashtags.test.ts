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

describe("the rest of the caption format", () => {
  // These match Market Square's rules exactly. A caption must read the same on
  // both surfaces, and two parsers is how $BTC ends up a chip on one screen
  // and plain text on the other.
  const kinds = (text: string, tradeable: string[] = []) =>
    parseCashtags(text, tradeable).map((s) => s.kind);

  it("marks up hashtags, and lowercases them to match the index", () => {
    const tag = parseCashtags("big for #Kospi", []).find((s) => s.kind === "hashtag");
    expect(tag).toMatchObject({ value: "#Kospi", tag: "kospi" });
  });

  it("refuses a numeric tag, a URL fragment and an id", () => {
    expect(kinds("in #2026")).toEqual(["text"]);
    expect(kinds("fixed issue#42")).toEqual(["text"]);
    // The URL wins; #section is part of the address.
    expect(kinds("see https://x.com/a#section")).toEqual(["text", "url"]);
  });

  it("marks up mentions but not an email", () => {
    expect(kinds("hey @prince")).toEqual(["text", "mention"]);
    expect(kinds("mail a@b.com")).toEqual(["text"]);
  });

  it("links only http(s), never a script or data URL", () => {
    // The value becomes an anchor href.
    for (const hostile of [
      "javascript:alert(1)",
      "data:text/html;base64,x",
      "file:///etc/passwd",
    ]) {
      expect(kinds(`go ${hostile}`)).toEqual(["text"]);
    }
    expect(kinds("go www.example.com")).toEqual(["text"]);
  });

  it("keeps the sentence's full stop out of the address", () => {
    const link = parseCashtags("read https://example.com/a.", []).find((s) => s.kind === "url");
    expect(link).toMatchObject({ href: "https://example.com/a" });
  });

  it("orders everything and loses no characters", () => {
    const text = "hi @prince $BTC up #kospi see https://example.com now";
    const segments = parseCashtags(text, ["BTC"]);
    expect(segments.map((s) => s.kind)).toEqual([
      "text",
      "mention",
      "text",
      "cashtag",
      "text",
      "hashtag",
      "text",
      "url",
      "text",
    ]);
    expect(segments.map((s) => s.value).join("")).toBe(text);
  });
});
