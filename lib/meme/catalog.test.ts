import { describe, expect, it } from "vitest";
import { impersonatesMajor, isWrappedMajor, tradableHere } from "@/lib/meme/catalog";
import { BASE_CHAIN_ID, SOLANA_CHAIN_ID } from "@/lib/meme/chain";
import type { MemeToken } from "@/lib/meme/types";

const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";

function token(chainId: number, address: string): MemeToken {
  return { chainId, address, symbol: address.slice(0, 4), decimals: 18 } as MemeToken;
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
      ({ chainId: BASE_CHAIN_ID, address: "0xabc", symbol, name }) as MemeToken;
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
        } as MemeToken,
        {
          chainId: BASE_CHAIN_ID,
          address: "0x1234000000000000000000000000000000000000",
          symbol: "AAA",
          name: "A",
        } as MemeToken,
      ],
      meta: { page: 1, limit: 2, total: 2 },
    });
    expect(page.items.map((t) => t.chainId)).toEqual([BASE_CHAIN_ID]);
    expect(page.meta.total).toBe(1);
  });
});
