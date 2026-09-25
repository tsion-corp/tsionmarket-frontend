import { describe, expect, it } from "vitest";
import { memeToken } from "@/lib/meme/fixture";
import { filterMemeTokens, memeSearchMatches, memeSearchTerms } from "@/lib/meme/search";
import { SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import type { MemeToken } from "@/lib/meme/types";

const NOW = Date.parse("2026-09-16T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

// Matches `token` against `query`, which is the whole path a keystroke takes.
const finds = (token: MemeToken, query: string): boolean => {
  const terms = memeSearchTerms(query);
  return terms !== null && memeSearchMatches(token, terms, NOW);
};

const pepe = memeToken({
  symbol: "PEPE",
  name: "Pepe coin",
  address: "0xA0b86991C6218b36c1d19D4a2e9Eb0cE3606eB48",
  pairAddress: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
  priceUsd: "0.00012345",
  marketCapUsd: "1530000",
  liquidityUsd: "84200",
  volume24hUsd: "12400000",
  fdvUsd: "2400000",
  dexName: "Uniswap",
  pairCreatedAt: minutesAgo(3 * 1440 + 120),
});

const bonk = memeToken({
  symbol: "BONK",
  name: "Bonk",
  chainId: SOLANA_CHAIN_ID,
  address: "DezXAZ8z7PnrnRJjz3wXBoRgixCaBoRgixCaBoRgixCa",
  pairAddress: null,
  priceUsd: "0.0000188",
  marketCapUsd: "1880000",
  liquidityUsd: "512345",
  volume24hUsd: "4200",
  fdvUsd: "9900000",
  dexName: "Raydium",
  pairCreatedAt: minutesAgo(45),
});

describe("reading the query", () => {
  it("is null for a query with nothing in it", () => {
    expect(memeSearchTerms("")).toBeNull();
    expect(memeSearchTerms("   ")).toBeNull();
  });

  it("keeps the case as typed and a lower-cased copy beside it", () => {
    expect(memeSearchTerms("  DezXAZ ")).toMatchObject({ text: "DezXAZ", lower: "dezxaz" });
  });

  it("reads a figure, a suffix and an age", () => {
    expect(memeSearchTerms("$1.5m")?.figure).toEqual({ digits: "15", place: 7 });
    expect(memeSearchTerms("3d")?.age).toEqual({ unit: "days", count: 3 });
    expect(memeSearchTerms("PEPE")?.figure).toBeNull();
  });
});

describe("searching by name and symbol", () => {
  it("still matches part of either, in any case", () => {
    expect(finds(pepe, "pep")).toBe(true);
    expect(finds(pepe, "PEPE")).toBe(true);
    expect(finds(pepe, "coin")).toBe(true);
    expect(finds(pepe, "wif")).toBe(false);
  });
});

describe("searching by contract address", () => {
  it("matches part of an address, not only the whole of it", () => {
    expect(finds(pepe, "0xA0b86991")).toBe(true);
    expect(finds(pepe, "3606eB48")).toBe(true);
  });

  // An EVM address is hex, where case carries nothing, so a pasted address in
  // any case finds its coin.
  it("ignores case on an EVM address", () => {
    expect(finds(pepe, "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48")).toBe(true);
    expect(finds(pepe, "0XA0B86991")).toBe(true);
  });

  // A Solana mint is base58: the same letters in another case are a different
  // address, so lower-casing the query would match a coin the reader did not
  // ask for.
  it("keeps case on a Solana mint", () => {
    expect(finds(bonk, "DezXAZ8z")).toBe(true);
    expect(finds(bonk, "dezxaz8z")).toBe(false);
  });

  it("matches the pair address the coin trades on", () => {
    expect(finds(pepe, "0x88e6A0c2")).toBe(true);
  });
});

describe("searching by venue and chain", () => {
  it("matches the dex and the chain the coin is on", () => {
    expect(finds(pepe, "uniswap")).toBe(true);
    expect(finds(bonk, "raydium")).toBe(true);
    expect(finds(bonk, "sol")).toBe(true);
    expect(finds(pepe, "base")).toBe(true);
    expect(finds(pepe, "solana")).toBe(false);
  });
});

describe("searching by market cap", () => {
  // Same magnitude and the digits typed lead the figure. 1.5M finds a
  // $1.53M cap and leaves a $1.88M one alone.
  it("matches a cap at the magnitude typed", () => {
    expect(finds(pepe, "1.5m")).toBe(true);
    expect(finds(bonk, "1.5m")).toBe(false);
    expect(finds(bonk, "1.8m")).toBe(true);
  });

  it("reads a dollar sign, a comma and either case of suffix", () => {
    expect(finds(pepe, "$1.5M")).toBe(true);
    expect(finds(pepe, "1,530,000")).toBe(true);
  });

  // A reader typing "500k" means the coins around half a million, not the
  // thousand dollars from 500,000 up, so liquidity of $512,345 answers it.
  it("widens a round figure rather than narrowing it", () => {
    expect(finds(bonk, "500k")).toBe(true);
    expect(finds(bonk, "600k")).toBe(false);
  });

  it("leaves a figure of another magnitude alone", () => {
    expect(finds(pepe, "15")).toBe(false);
    expect(finds(pepe, "1.5b")).toBe(false);
  });
});

describe("searching by price", () => {
  // The case the whole contract exists for: a price of 0.00012345 must be
  // findable by what a reader can see of it, and must not be read as zero.
  it("matches a price below a cent by its leading digits", () => {
    expect(finds(pepe, "0.0001")).toBe(true);
    expect(finds(pepe, "0.00012")).toBe(true);
    expect(finds(pepe, "0.0002")).toBe(false);
    expect(finds(bonk, "0.0000188")).toBe(true);
  });
});

describe("searching by volume, liquidity and fully diluted value", () => {
  it("covers the rest of the row's figures", () => {
    expect(finds(pepe, "12.4m")).toBe(true);
    expect(finds(pepe, "84.2k")).toBe(true);
    expect(finds(pepe, "2.4m")).toBe(true);
    expect(finds(bonk, "4200")).toBe(true);
  });
});

describe("searching by age", () => {
  it("matches the whole units since the pair was created", () => {
    expect(finds(pepe, "3d")).toBe(true);
    expect(finds(pepe, "4d")).toBe(false);
    expect(finds(pepe, "74h")).toBe(true);
    expect(finds(bonk, "45min")).toBe(true);
    expect(finds(bonk, "0h")).toBe(true);
  });

  // "m" is a million, so a coin whose cap is not 45M does not answer "45m".
  it("reads a bare m as a million, not a minute", () => {
    expect(finds(bonk, "45m")).toBe(false);
  });

  it("matches no age when the service published no pair date", () => {
    expect(finds(memeToken({ symbol: "NEW", pairCreatedAt: null }), "3d")).toBe(false);
  });
});

describe("filtering the catalogue", () => {
  it("hands the list straight back when nothing is typed", () => {
    const tokens = [pepe, bonk];
    expect(filterMemeTokens(tokens, memeSearchTerms(""), NOW)).toBe(tokens);
  });

  it("keeps the rows that answer the query", () => {
    expect(filterMemeTokens([pepe, bonk], memeSearchTerms("1.5m"), NOW)).toEqual([pepe]);
    expect(filterMemeTokens([pepe, bonk], memeSearchTerms("zzz"), NOW)).toEqual([]);
  });
});
