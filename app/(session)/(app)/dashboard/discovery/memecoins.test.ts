// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemeToken } from "@/lib/meme/api";

const useTrendingMemes = vi.fn();
vi.mock("@/features/trade/hooks/use-meme-tokens", () => ({
  useTrendingMemes: () => useTrendingMemes(),
}));

const { useMemeSpots } = await import("./memecoins");

const coin = (over: Partial<MemeToken> = {}): MemeToken => ({
  chainId: 8453,
  address: "0x1",
  name: "Basecat",
  symbol: "BASECAT",
  decimals: 18,
  logoUrl: "https://cdn.example/basecat.png",
  priceUsd: "0.01",
  liquidityUsd: "1000",
  volume24hUsd: "1000",
  priceChange24hPercent: "40.85",
  marketCapUsd: null,
  fdvUsd: null,
  pairAddress: null,
  dexName: null,
  riskLevel: "LOW",
  buyEnabled: true,
  sellEnabled: true,
  warnings: [],
  ...over,
});

beforeEach(() => {
  useTrendingMemes.mockReset();
});

describe("useMemeSpots", () => {
  it("features a coin by its ticker, with its move formatted", () => {
    useTrendingMemes.mockReturnValue({ tokens: [coin()] });
    const { result } = renderHook(() => useMemeSpots());
    expect(result.current).toEqual([
      {
        symbol: "BASECAT",
        name: "Basecat",
        change: "+40.85%",
        up: true,
        image: "https://cdn.example/basecat.png",
        href: "/meme",
      },
    ]);
  });

  // The trending feed is a pump feed, and a listing named after a repository
  // or a website is a listing, not a memecoin. The card would read the URL
  // out as the coin's name and point people at a codebase.
  it("does not feature a coin named after a link", () => {
    useTrendingMemes.mockReturnValue({
      tokens: [
        coin({ address: "0x2", symbol: "YESPLAYMUSIC", name: "github.com/qier222/YESPLAYMUSIC" }),
        coin({ address: "0x3", symbol: "https://pump.fun", name: "Pump" }),
        coin({ address: "0x4", symbol: "WWW", name: "www.example.com" }),
        coin(),
      ],
    });
    const { result } = renderHook(() => useMemeSpots());
    expect(result.current.map((spot) => spot.symbol)).toEqual(["BASECAT"]);
  });
});
