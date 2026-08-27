import { describe, expect, it } from "vitest";
import { insertSymbol } from "@/lib/square/insert-symbol";
import { parseCashtags } from "@/lib/square/cashtags";

describe("insertSymbol", () => {
  it("inserts at the caret, not at the end", () => {
    const { text } = insertSymbol("buying and selling", "BTC", 6);
    expect(text).toBe("buying $BTC and selling");
  });

  it("adds no leading space at the start of an empty composer", () => {
    expect(insertSymbol("", "BTC", 0)).toEqual({ text: "$BTC", caret: 4 });
  });

  it("leaves the caret ready to keep typing", () => {
    const { text, caret } = insertSymbol("hi", "ETH", 2);
    expect(text).toBe("hi $ETH");
    expect(caret).toBe(text.length);
  });

  it("does not double a space that is already there", () => {
    expect(insertSymbol("hi ", "BTC", 3).text).toBe("hi $BTC");
    expect(insertSymbol("a b", "BTC", 2).text).toBe("a $BTC b");
  });

  it("uppercases the symbol", () => {
    expect(insertSymbol("", "btc", 0).text).toBe("$BTC");
  });

  it("clamps a caret outside the text rather than corrupting it", () => {
    expect(insertSymbol("hi", "BTC", 99).text).toBe("hi $BTC");
    expect(insertSymbol("hi", "BTC", -5).text).toBe("$BTC hi");
  });

  // The point of the whole tool: what it inserts must survive the parser the
  // feed renders with, otherwise the author tagged a coin for nothing.
  it("always produces a tag the feed will render as a chip", () => {
    for (const [text, caret] of [
      ["", 0],
      ["watching", 8],
      ["watching today", 8],
      ["a", 1],
    ] as const) {
      const inserted = insertSymbol(text, "BTC", caret);
      const tags = parseCashtags(inserted.text, ["BTC"]).filter((s) => s.kind === "cashtag");
      expect(tags, `"${inserted.text}"`).toHaveLength(1);
    }
  });
});
