import { describe, expect, it } from "vitest";
import { isWrappedMajor, tradableHere } from "@/lib/meme/catalog";
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
