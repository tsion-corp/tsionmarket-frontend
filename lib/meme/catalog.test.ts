import { describe, expect, it } from "vitest";
import {
  MIN_DISCOVERY_LIQUIDITY_USD,
  MIN_DISCOVERY_VOLUME_24H_USD,
  impersonatesMajor,
  isTokenizedEquity,
  isWrappedMajor,
  tradableHere,
} from "@/lib/meme/catalog";
import { BASE_CHAIN_ID, SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import type { MemeToken } from "@/lib/meme/types";

const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";

function token(chainId: number, address: string): MemeToken {
  return {
    chainId,
    address,
    symbol: address.slice(0, 4),
    decimals: 18,
    riskLevel: "LOW",
  } as MemeToken;
}

// cbBTC is Bitcoin in a Base wrapper. A wrapper worth billions sitting between
// two joke coins makes the whole memecoin list read as unfiltered, and it
// already has a home on the spot desk.
describe("isWrappedMajor", () => {
  it("names cbBTC on Base, whatever the casing", () => {
    expect(isWrappedMajor(BASE_CHAIN_ID, CBBTC)).toBe(true);
    expect(isWrappedMajor(BASE_CHAIN_ID, CBBTC.toUpperCase().replace("0X", "0x"))).toBe(true);
  });

  // Wrapped SOL is Solana's gas token in SPL form, and wrapped ETH is Base's.
  // Both sit in the catalogue among the memecoins and neither is one.
  it("names wrapped SOL on Solana and wrapped ETH on Base", () => {
    expect(isWrappedMajor(SOLANA_CHAIN_ID, "So11111111111111111111111111111111111111112")).toBe(
      true
    );
    expect(isWrappedMajor(BASE_CHAIN_ID, "0x4200000000000000000000000000000000000006")).toBe(true);
  });

  it("keeps everything else", () => {
    expect(isWrappedMajor(BASE_CHAIN_ID, "0x1234000000000000000000000000000000000000")).toBe(false);
    expect(isWrappedMajor(SOLANA_CHAIN_ID, CBBTC)).toBe(false);
  });
});

describe("tradableHere", () => {
  it("drops the wrapped majors alongside the quote currency", () => {
    const page = tradableHere({
      items: [
        token(BASE_CHAIN_ID, CBBTC),
        token(BASE_CHAIN_ID, "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"),
        token(BASE_CHAIN_ID, "0x1234000000000000000000000000000000000000"),
      ],
      meta: { page: 1, limit: 3, total: 3 },
    });
    expect(page.items.map((t) => t.address)).toEqual([
      "0x1234000000000000000000000000000000000000",
    ]);
    expect(page.meta.total).toBe(1);
  });
});

// The discovery feed carries impersonators: dozens of Solana rows called
// "SOL", "Solana", "ETH" or "Ethereum" with liquidity in the billions. A coin
// that claims to be a major is either the major, which is not a memecoin, or
// a scam. Neither belongs on this surface.
describe("impersonatesMajor", () => {
  const t = (symbol: string | null, name: string | null) =>
    ({ chainId: SOLANA_CHAIN_ID, address: "x", symbol, name }) as MemeToken;

  it("catches the majors by symbol, whatever the case or a leading $", () => {
    expect(impersonatesMajor(t("SOL", "Solana"))).toBe(true);
    expect(impersonatesMajor(t("sol", "anything"))).toBe(true);
    expect(impersonatesMajor(t("$ETH", "Eth coin"))).toBe(true);
    expect(impersonatesMajor(t("WBTC", "Wrapped Bitcoin"))).toBe(true);
    expect(impersonatesMajor(t("USDT", "Tether"))).toBe(true);
  });

  it("catches the majors by name when the symbol is disguised", () => {
    expect(impersonatesMajor(t("SLNA", "Solana"))).toBe(true);
    expect(impersonatesMajor(t("XYZ", "Ethereum"))).toBe(true);
    expect(impersonatesMajor(t("XYZ", "Wrapped Ethereum (Sollet)"))).toBe(true);
  });

  it("keeps coins that merely mention a chain", () => {
    expect(impersonatesMajor(t("BONK", "Bonk"))).toBe(false);
    expect(impersonatesMajor(t("SOLCAT", "Solana Cat"))).toBe(false);
    expect(impersonatesMajor(t("ETHDOG", "Ethereumdog Coin"))).toBe(false);
    expect(impersonatesMajor(t(null, null))).toBe(false);
  });

  it("is applied at the boundary", () => {
    const onBase = (symbol: string, name: string) =>
      ({ chainId: BASE_CHAIN_ID, address: "0xabc", symbol, name, riskLevel: "LOW" }) as MemeToken;
    const page = tradableHere({
      items: [onBase("SOL", "Solana"), onBase("BONK", "Bonk")],
      meta: { page: 1, limit: 2, total: 2 },
    });
    expect(page.items.map((x) => x.symbol)).toEqual(["BONK"]);
  });
});

// TEMPORARY: the Solana gas sponsor is unfunded, so a Solana coin cannot be
// bought or sold. Discovery is Base-only until it is topped up; nothing on
// screen says so, the rows are simply absent.
describe("discovery chains while the Solana sponsor is unfunded", () => {
  it("drops Solana rows at the boundary", () => {
    const page = tradableHere({
      items: [
        {
          chainId: SOLANA_CHAIN_ID,
          address: "BonkMint",
          symbol: "BONK",
          name: "Bonk",
          riskLevel: "LOW",
        } as MemeToken,
        {
          chainId: BASE_CHAIN_ID,
          address: "0x1234000000000000000000000000000000000000",
          symbol: "AAA",
          name: "A",
          riskLevel: "LOW",
        } as MemeToken,
      ],
      meta: { page: 1, limit: 2, total: 2 },
    });
    expect(page.items.map((t) => t.chainId)).toEqual([BASE_CHAIN_ID]);
    expect(page.meta.total).toBe(1);
  });
});

// Requested on 2026-09-07: unrated and low-rated coins off the board. In the
// trade service's own terms an unrated coin is riskLevel UNKNOWN (status
// DISCOVERED) and the low band is HIGH; CRITICAL rows are BLOCKED and cannot
// trade anyway. Discovery keeps LOW and MEDIUM. Holdings are unaffected: the
// allowlist reads the catalog directly, and the sell sheet fetches a held
// token by address.
describe("discovery keeps only rated, non-high-risk coins", () => {
  const onBase = (symbol: string, riskLevel: MemeToken["riskLevel"] | undefined) =>
    ({
      chainId: BASE_CHAIN_ID,
      address: `0x${symbol.toLowerCase().padEnd(40, "1")}`,
      symbol,
      name: symbol,
      riskLevel,
    }) as MemeToken;

  it("drops UNKNOWN, HIGH and CRITICAL rows and keeps LOW and MEDIUM", () => {
    const page = tradableHere({
      items: [
        onBase("AAA", "LOW"),
        onBase("BBB", "MEDIUM"),
        onBase("CCC", "HIGH"),
        onBase("DDD", "CRITICAL"),
        onBase("EEE", "UNKNOWN"),
        onBase("FFF", undefined),
      ],
      meta: { page: 1, limit: 6, total: 6 },
    });
    expect(page.items.map((t) => t.symbol)).toEqual(["AAA", "BBB"]);
    expect(page.meta.total).toBe(2);
  });
});

// Requested on 2026-09-07: the "GOOGLE" token off the board. GOOGLc is a
// tokenized share of Alphabet Inc., one of three such rows on Base sharing
// the issuer's 0xb2000000… address prefix (GOOGLc, TSLAc, $BSLN). They are
// equities, not memecoins, and the buy failed. Removing the catalog rows is
// the trade service's job; discovery drops them here meanwhile.
describe("isTokenizedEquity", () => {
  const t = (symbol: string, name: string, address: string) =>
    ({ chainId: BASE_CHAIN_ID, address, symbol, name, riskLevel: "LOW" }) as MemeToken;

  it("catches the known tokenized shares and corporate names", () => {
    expect(
      isTokenizedEquity(t("GOOGLc", "Alphabet Inc.", "0xb2000000000000000000002d0ba3164cc74f58b7"))
    ).toBe(true);
    expect(
      isTokenizedEquity(t("TSLAc", "Tesla Inc.", "0xB2000000000000000000001e800A7f5189430Cd0"))
    ).toBe(true);
    expect(
      isTokenizedEquity(t("$BSLN", "Baseline Corp", "0xb200000000000000000000639f1e75d3a2aedd01"))
    ).toBe(true);
    expect(
      isTokenizedEquity(t("ACME", "Acme Corp.", "0x1111000000000000000000000000000000000001"))
    ).toBe(true);
  });

  // The 0xb2000000… prefix is NOT an issuer mark: 41 Base tokens share it,
  // most of them ordinary memecoins (BRIAN, Basecat, MOONBASE, BASEJUICE were
  // all ACTIVE on 2026-09-07). A rule on the prefix hid them; only the names
  // and the three known addresses count.
  it("keeps memecoins that merely share the vanity address prefix", () => {
    expect(
      isTokenizedEquity(t("BRIAN", "Brian", "0xb2000000000000000000000000000000000000aa"))
    ).toBe(false);
    expect(
      isTokenizedEquity(t("BASEJUICE", "Base Juice", "0xb20000000000000000000000000000000000bbbb"))
    ).toBe(false);
  });

  it("keeps memecoins whose names merely sound corporate", () => {
    expect(isTokenizedEquity(t("BONK", "Bonk", "0x1111000000000000000000000000000000000002"))).toBe(
      false
    );
    expect(
      isTokenizedEquity(t("INCEL", "Incredible Coin", "0x1111000000000000000000000000000000000003"))
    ).toBe(false);
    expect(
      isTokenizedEquity(
        t("BA", "British American Oil Company", "0x27b4a79b0633d4be1bbbc2f9912a49d9204304c9")
      )
    ).toBe(false);
  });

  it("is applied at the boundary", () => {
    const page = tradableHere({
      items: [
        t("GOOGLc", "Alphabet Inc.", "0xb2000000000000000000002d0ba3164cc74f58b7"),
        t("BRIAN", "Brian", "0xb2000000000000000000000000000000000000aa"),
      ],
      meta: { page: 1, limit: 2, total: 2 },
    });
    expect(page.items.map((x) => x.symbol)).toEqual(["BRIAN"]);
  });
});

// Requested on 2026-09-07: hide DEGEN. It is a LOW-risk active row, so the
// rating rule keeps it; a per-address hidden set takes it off discovery.
// Holdings are unaffected, as with every other removal.
describe("hidden memecoins", () => {
  it("drops DEGEN on Base from discovery", () => {
    const page = tradableHere({
      items: [
        {
          chainId: BASE_CHAIN_ID,
          address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
          symbol: "DEGEN",
          name: "Degen",
          riskLevel: "LOW",
        } as MemeToken,
        {
          chainId: BASE_CHAIN_ID,
          address: "0x1234000000000000000000000000000000000000",
          symbol: "AAA",
          name: "A",
          riskLevel: "LOW",
        } as MemeToken,
      ],
      meta: { page: 1, limit: 2, total: 2 },
    });
    expect(page.items.map((t) => t.symbol)).toEqual(["AAA"]);
  });
});

// "All these meme coins that can't be bought": a row the service marks
// unbuyable, or not ACTIVE, or with too little liquidity to fill a buy, has no
// business on a buy surface whatever its rating (2026-09-07). Holdings are
// unaffected, as with every other discovery rule.
describe("discovery keeps only coins that can actually be bought", () => {
  const onBase = (symbol: string, extra: Partial<MemeToken>) =>
    ({
      chainId: BASE_CHAIN_ID,
      address: `0x${symbol.toLowerCase().padEnd(40, "2")}`,
      symbol,
      name: symbol,
      riskLevel: "LOW",
      liquidityUsd: "150000",
      volume24hUsd: "25000",
      ...extra,
    }) as MemeToken;

  it("drops rows the service marks unbuyable or not ACTIVE", () => {
    const page = tradableHere({
      items: [
        onBase("AAA", {}),
        onBase("BBB", { buyEnabled: false }),
        onBase("CCC", { status: "BLOCKED" } as Partial<MemeToken>),
        onBase("DDD", { status: "ACTIVE" } as Partial<MemeToken>),
      ],
      meta: { page: 1, limit: 4, total: 4 },
    });
    expect(page.items.map((t) => t.symbol)).toEqual(["AAA", "DDD"]);
  });

  // WKC on 2026-09-07: ACTIVE, buyable, $369k of "liquidity", two cents of
  // volume in 24 hours. 41 of the 104 rows the board showed had under a
  // dollar of daily volume: dead pools whose liquidity figure is stale, where
  // a buy cannot fill. Volume is the signal liquidity is not.
  it("drops rows with no meaningful daily volume and keeps rows with no volume figure", () => {
    const page = tradableHere({
      items: [
        onBase("DEAD", { volume24hUsd: "0.02" }),
        onBase("QUIET", { volume24hUsd: String(MIN_DISCOVERY_VOLUME_24H_USD - 1) }),
        onBase("LIVE", { volume24hUsd: String(MIN_DISCOVERY_VOLUME_24H_USD) }),
        onBase("UNKNOWNVOL", { volume24hUsd: null }),
      ],
      meta: { page: 1, limit: 4, total: 4 },
    });
    expect(page.items.map((t) => t.symbol)).toEqual(["LIVE", "UNKNOWNVOL"]);
  });

  it("drops rows under the liquidity floor and keeps rows with no liquidity figure", () => {
    const page = tradableHere({
      items: [
        onBase("THIN", { liquidityUsd: String(MIN_DISCOVERY_LIQUIDITY_USD - 1) }),
        onBase("OK", { liquidityUsd: String(MIN_DISCOVERY_LIQUIDITY_USD) }),
        onBase("UNKNOWNLIQ", { liquidityUsd: null }),
      ],
      meta: { page: 1, limit: 3, total: 3 },
    });
    expect(page.items.map((t) => t.symbol)).toEqual(["OK", "UNKNOWNLIQ"]);
  });
});
