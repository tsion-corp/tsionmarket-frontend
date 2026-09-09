import { describe, expect, it } from "vitest";
import { freshFor, freshParam, parseFreshParam, scopeOf } from "./fresh-scope";

const KNOWN = ["base-mainnet", "eth-mainnet", "solana-mainnet"];

describe("parseFreshParam", () => {
  it("keeps the legacy fresh=1 meaning everything", () => {
    expect(parseFreshParam("1", KNOWN)).toBe("all");
  });

  it("names the networks to re-read and drops ones it does not know", () => {
    expect(parseFreshParam("base-mainnet, solana-mainnet,made-up", KNOWN)).toEqual([
      "base-mainnet",
      "solana-mainnet",
    ]);
  });

  it("is no scope at all when nothing usable was asked for", () => {
    expect(parseFreshParam(null, KNOWN)).toBeNull();
    expect(parseFreshParam("", KNOWN)).toBeNull();
    expect(parseFreshParam("made-up", KNOWN)).toBeNull();
  });
});

describe("freshFor", () => {
  it("re-reads only the named networks", () => {
    expect(freshFor(["base-mainnet"], "base-mainnet")).toBe(true);
    expect(freshFor(["base-mainnet"], "eth-mainnet")).toBe(false);
    expect(freshFor("all", "eth-mainnet")).toBe(true);
    expect(freshFor(null, "base-mainnet")).toBe(false);
  });
});

describe("freshParam", () => {
  it("round-trips through the wire form", () => {
    expect(parseFreshParam(freshParam(["base-mainnet", "eth-mainnet"]), KNOWN)).toEqual([
      "base-mainnet",
      "eth-mainnet",
    ]);
    expect(freshParam("all")).toBe("1");
  });
});

describe("scopeOf", () => {
  it("names the networks it was given once each", () => {
    expect(scopeOf("base-mainnet", null, "base-mainnet", "solana-mainnet")).toEqual([
      "base-mainnet",
      "solana-mainnet",
    ]);
  });

  it("falls back to the full sweep when it knows none", () => {
    expect(scopeOf(null, undefined)).toBe("all");
  });
});
