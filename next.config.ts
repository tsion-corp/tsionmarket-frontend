import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Links the next-intl request config (i18n/request.ts) into the build. The app
// localizes via a cookie, not locale URLs, so routing is untouched.
const withNextIntl = createNextIntlPlugin();
const defaultChessAssetBaseUrl = "https://pub-669f5226f445418d8b07f013b8de572d.r2.dev";
const chessAssetBaseUrl = (
  process.env.R2_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_CHESS_ASSET_BASE_URL ??
  defaultChessAssetBaseUrl
).replace(/\/+$/u, "");
const chessAssetPrefix = `${chessAssetBaseUrl}/chess-assets/v1`;
const migratedLichessAssetRoots = [
  "cursors",
  "data",
  "fide",
  "flags",
  "flair",
  "font",
  "images",
  "javascripts",
  "lifat",
  "logo",
  "oops",
  "piece",
  "sound",
  "vendor",
  "video",
];

// Without this id every wallet, login and signature in the app is dead, so a
// production build that is missing it should not produce a bundle at all.
//
// The check belongs here because this file runs during the build. The same
// throw inside app/(session)/providers.tsx does nothing: that is a client
// module, its scope is not evaluated while building, and the
// failure would surface as a blank page in the browser instead.
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
  throw new Error(
    "NEXT_PUBLIC_PRIVY_APP_ID is not set. Set it in the environment before building for production."
  );
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CHESS_ASSET_BASE_URL: chessAssetBaseUrl,
  },
  // The push service worker, and nothing else. A worker is fetched by the
  // browser outside the app's own asset pipeline, so it gets neither a
  // content hash in its name nor the immutable caching that comes with one.
  // Without these two headers a browser can keep serving a worker from a
  // previous deploy indefinitely: the Cache-Control forces a fresh fetch on
  // every update check, and the Content-Type is what makes a browser willing
  // to register the file as a script at all.
  async headers() {
    return [
      {
        source: "/push-service-worker.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  // Powerball became ArkBall. Shared links and bookmarks to the old slug still
  // land on the game.
  async redirects() {
    return [
      { source: "/casino/powerball", destination: "/casino/arkball", permanent: true },
      // Temporary for the first 2.0 release: a 308 is cached by browsers and
      // would fight a rollback. Flip to permanent once 2.0 has held.
      { source: "/dashboard", destination: "/portfolio", permanent: false },
      { source: "/dashboard/:path*", destination: "/portfolio/:path*", permanent: false },
      ...migratedLichessAssetRoots.map((root) => ({
        source: `/chess/lichess/${root}/:path*`,
        destination: `${chessAssetPrefix}/chess/lichess/${root}/:path*`,
        permanent: false,
      })),
    ];
  },
  // Lichess assets are stored once under a namespace. Root URLs are retained
  // as fallback aliases because the upstream CSS and runtime build them.
  async rewrites() {
    return {
      fallback: [
        {
          source: "/npm/:path*",
          destination: `${chessAssetPrefix}/npm/:path*`,
        },
        ...migratedLichessAssetRoots.map((root) => ({
          source: `/${root}/:path*`,
          destination: `${chessAssetPrefix}/chess/lichess/${root}/:path*`,
        })),
      ],
    };
  },
  // Pin the Turbopack root to this project. Otherwise Next walks up the tree,
  // finds the stray ~/package-lock.json, and treats the whole home directory as
  // the workspace root — so Turbopack watches far more of the filesystem than it
  // needs to (and prints a "multiple lockfiles" warning on every start).
  turbopack: {
    root: import.meta.dirname,
    resolveAlias: {
      "@stripe/crypto": "./lib/stubs/empty.ts",
      "@farcaster/mini-app-solana": "./lib/stubs/empty.ts",
    },
  },
  webpack(config) {
    // Privy's root bundle references optional Stripe/Farcaster integrations
    // even though this app uses neither. Mark them unavailable explicitly so
    // webpack does not emit a missing-module warning on every Fast Refresh.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@stripe/crypto": false,
      "@farcaster/mini-app-solana": false,
    };
    return config;
  },
  // The legacy directory is read with a constructed path, which the tracer
  // cannot follow — without this the file is simply absent from the serverless
  // bundle and every lookup silently answers "unknown". Only matters when
  // LEGACY_DIRECTORY_URL is unset and the bundled file is the source.
  outputFileTracingIncludes: {
    "/api/migration/legacy-account": ["./config/legacy-directory.csv"],
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
    // Import only the referenced members of these barrel packages instead of the
    // whole module graph. @privy-io/react-auth alone is a 332-module barrel and
    // loads on every route via the root Providers, so without this Turbopack
    // compiles all of it on the first request. Mirrors the sibling earn app,
    // which stays fast for the same web3 stack. Limited to barrels this app uses.
    optimizePackageImports: [
      "@privy-io/react-auth",
      "@privy-io/node",
      "@tanstack/react-query",
      "@tanstack/react-table",
      "@solana/kit",
      "@solana-program/token",
      "@polymarket/client",
      "@base-ui/react",
      "chess.js",
      "motion",
      "sonner",
      "embla-carousel-react",
      "tailwind-merge",
      // The heaviest packages on the first-load path that were missing from
      // this list: viem is 532 kB gzip reachable from the root providers, and
      // the other two are barrels whose whole graph came along for one import
      // each.
      "viem",
      "lightweight-charts",
      "next-intl",
    ],
  },
};

export default withNextIntl(nextConfig);
