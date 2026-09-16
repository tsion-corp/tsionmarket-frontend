import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import { scrubVenue } from "@/features/trade/lib/venue-scrub";

// llms.txt §0: a trader never sees the venue's name. The backend already
// de-brands its errors; this is the check on anything that reaches the screen
// anyway, from a wallet, a chain, or a message that slipped through.

describe("scrubVenue", () => {
  it("names the product instead of the venue, in any casing", () => {
    expect(scrubVenue("Hyperliquid rejected the order")).toBe("Ark rejected the order");
    expect(scrubVenue("HYPERLIQUID is busy")).toBe("Ark is busy");
    expect(scrubVenue("minted on HyperEVM")).toBe("minted on Ark");
  });

  it("calls the venue's margin account the perps balance", () => {
    expect(scrubVenue("Insufficient HyperCore balance")).toBe("Insufficient perps balance");
    expect(scrubVenue("hypercore margin is low")).toBe("perps margin is low");
  });

  it("catches the spaced and hyphenated spellings too", () => {
    expect(scrubVenue("Hyper Liquid and Hyper-Core")).toBe("Ark and perps");
  });

  it("leaves a message without the venue untouched", () => {
    expect(scrubVenue("Order rejected: price moved.")).toBe("Order rejected: price moved.");
  });
});

// The same rule on the app's own words: no English catalogue string may name
// the venue. The other four catalogues are translations of these keys.
describe("the English catalogue", () => {
  it("never names the venue", () => {
    const offenders: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === "string") {
        if (/hyper[\s-]?(liquid|core|evm)/i.test(node)) offenders.push(path);
        return;
      }
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
      }
    };
    walk(en, "");
    expect(offenders).toEqual([]);
  });
});
