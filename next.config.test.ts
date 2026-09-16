import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("chess R2 routing", () => {
  it("redirects namespaced Lichess media to the immutable R2 release", async () => {
    const redirects = await nextConfig.redirects?.();
    const pieceRoute = redirects?.find((route) => route.source === "/chess/lichess/piece/:path*");

    expect(pieceRoute).toMatchObject({
      destination:
        "https://pub-669f5226f445418d8b07f013b8de572d.r2.dev/chess-assets/v1/chess/lichess/piece/:path*",
      permanent: false,
    });
  });

  it("uses fallback rewrites so local npm workers and shared app images win first", async () => {
    const rewrites = await nextConfig.rewrites?.();
    if (!rewrites || Array.isArray(rewrites)) throw new Error("Expected grouped Next.js rewrites");

    expect(rewrites.fallback).toEqual(
      expect.arrayContaining([
        {
          source: "/npm/:path*",
          destination:
            "https://pub-669f5226f445418d8b07f013b8de572d.r2.dev/chess-assets/v1/npm/:path*",
        },
        {
          source: "/images/:path*",
          destination:
            "https://pub-669f5226f445418d8b07f013b8de572d.r2.dev/chess-assets/v1/chess/lichess/images/:path*",
        },
      ])
    );
  });
});
