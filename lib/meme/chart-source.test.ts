import { describe, expect, it } from "vitest";
import { memeChartSource } from "@/lib/meme/chart-source";
import { memeToken } from "@/lib/meme/fixture";
import { BASE_CHAIN_ID, SOLANA_CHAIN_ID } from "@/lib/meme/chain";

// Which source a memecoin charts from. The answer matters more than it looks:
// measured against 20 live Base rows on 2026-09-30, 6 had no CoinGecko listing
// at all, and every one of those charted from its pool. Picking the listing
// first would leave roughly a third of this desk blank, which is the bug this
// file exists to keep fixed.

describe("memeChartSource", () => {
  const POOL = "0xD76D4487570000000000000000000000000000aa";
  const ADDRESS = "0x4cd9a847f39106e19a4e41aea8a232e915c82af5";

  it("charts from the pool, and names the token inside it", () => {
    const token = memeToken({ chainId: BASE_CHAIN_ID, address: ADDRESS, pairAddress: POOL });

    expect(memeChartSource(token, null)).toEqual({
      kind: "pool",
      chain: "base",
      pool: POOL,
      token: ADDRESS,
      id: null,
    });
  });

  // A pool has two sides and the desk's pairAddress may hold this token as
  // either. Without the token the upstream charts the pool's base side, which
  // for a quote-side token is a different asset's price drawn as if it were
  // this one's — wrong, and wrong silently.
  it("never asks for a pool without saying which side of it to chart", () => {
    const source = memeChartSource(
      memeToken({ chainId: BASE_CHAIN_ID, address: ADDRESS, pairAddress: POOL }),
      null
    );

    expect(source).not.toBeNull();
    expect(source).toHaveProperty("token", ADDRESS);
  });

  // The pool is tried first and the listing is the fallback, so both travel
  // together when both exist.
  it("carries the listing along when the token has one", () => {
    const token = memeToken({ chainId: BASE_CHAIN_ID, address: ADDRESS, pairAddress: POOL });

    expect(memeChartSource(token, "ethoswarm")).toMatchObject({
      kind: "pool",
      id: "ethoswarm",
    });
  });

  it("falls back to the listing when the service published no pool", () => {
    const token = memeToken({ chainId: BASE_CHAIN_ID, address: ADDRESS, pairAddress: null });

    expect(memeChartSource(token, "ethoswarm")).toEqual({ kind: "coingecko", id: "ethoswarm" });
  });

  // The one genuinely chartless case, and the only one the screen should say
  // "no chart yet" for.
  it("has no source at all with neither a pool nor a listing", () => {
    const token = memeToken({ chainId: BASE_CHAIN_ID, address: ADDRESS, pairAddress: null });

    expect(memeChartSource(token, null)).toBeNull();
  });

  it("charts a Solana pool on the Solana network", () => {
    const token = memeToken({
      chainId: SOLANA_CHAIN_ID,
      address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
      pairAddress: "5zpyutJu9ee6jFymDGoK7F6S5Kczqtc9FomP3ueKuyA9",
    });

    expect(memeChartSource(token, null)).toMatchObject({ kind: "pool", chain: "solana" });
  });

  // An unknown chain has no network slug, so the pool cannot be addressed even
  // though the row carries one. The listing is what is left.
  it("does not invent a pool source for a chain it cannot name", () => {
    const token = memeToken({ chainId: 999_999, address: ADDRESS, pairAddress: POOL });

    expect(memeChartSource(token, "ethoswarm")).toEqual({ kind: "coingecko", id: "ethoswarm" });
    expect(memeChartSource(token, null)).toBeNull();
  });
});
