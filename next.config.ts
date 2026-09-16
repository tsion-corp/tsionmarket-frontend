import packageJson from "./package.json";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
// From "@sentry/nextjs/config", not "@sentry/nextjs". The root export of this
// helper is deprecated in v10 and stops working in v11.
import { withSentryConfig } from "@sentry/nextjs/config";

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
  // Stamped into the client bundle so analytics can attribute an event to the
  // release it came from. Read from package.json, so it moves with a version
  // bump instead of being maintained by hand.
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_CHESS_ASSET_BASE_URL: chessAssetBaseUrl,
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
      "@livekit/components-react",
      "@base-ui/react",
      "chess.js",
      "motion",
      "sonner",
      "embla-carousel-react",
      "tailwind-merge",
      // The heaviest packages on the first-load path that were missing from
      // this list: viem is 532 kB gzip reachable from the root providers, and
      // the other three are barrels whose whole graph came along for one
      // import each.
      "viem",
      "livekit-client",
      "lightweight-charts",
      "next-intl",
    ],
  },
};

// Source map upload is OFF unless explicitly asked for, and that default is
// deliberate rather than lazy.
//
// Uploading maps is what turns an issue from a stack of minified frames into
// something readable, so we do want it eventually. But the first build with it
// enabled hung: `sentry-cli sourcemaps upload` sat against
// watchtower-logger.vercel.app and never returned. The cause was a leftover
// sentry.io account in .env; its SENTRY_AUTH_TOKEN was enough to make the
// plugin attempt a real upload, against a host that could not authenticate it.
// A build step that can hang is a broken CI pipeline, and a telemetry tool must
// not be able to stop a release.
//
// Hence the WATCHTOWER_ names below rather than the plugin's conventional
// SENTRY_ ones. The rename is the actual fix for that incident: the plugin
// picks SENTRY_* up from the environment on its own, so as long as we read
// those, any stray token in any environment can silently switch uploading back
// on. Reading our own names means nothing happens unless we ask for it.
//
// Watchtower's upload endpoint now speaks the Sentry /api/0 protocol, so the
// upload is enabled again. The switch is the presence of an org token rather
// than a separate flag: a token only exists where an upload is wanted, which is
// CI, and a laptop or a preview without one still builds and simply ships no
// maps. One knob, and it is the credential itself.
const UPLOAD_SOURCEMAPS = Boolean(
  process.env.WATCHTOWER_AUTH_TOKEN && process.env.WATCHTOWER_ORG && process.env.WATCHTOWER_PROJECT
);

export default withSentryConfig(withNextIntl(nextConfig), {
  // Watchtower is the upload target, not sentry.io.
  sentryUrl: "https://watchtower-logger.vercel.app",
  org: process.env.WATCHTOWER_ORG,
  project: process.env.WATCHTOWER_PROJECT,
  authToken: process.env.WATCHTOWER_AUTH_TOKEN,
  silent: !process.env.CI,
  // The plugin reports build metrics to Sentry's own servers by default. We do
  // not use Sentry as a service, and our build details are not theirs to hold.
  telemetry: false,
  // Second belt to the opt-in above: if an upload is attempted and fails, say
  // so and carry on. A missing source map degrades an issue; it must never
  // fail a build.
  errorHandler: (error: Error) => {
    console.warn("[watchtower] source map upload failed, continuing:", error.message);
  },
  // Maps are uploaded, then stripped from what the browser downloads, so
  // readers never fetch them and the app's source is not published.
  sourcemaps: { disable: !UPLOAD_SOURCEMAPS, deleteSourcemapsAfterUpload: true },
  // NO `tunnelRoute` here, and this is load-bearing. It looks like the right
  // option (it proxies events through our own origin so an ad blocker cannot
  // silence reporting), but the rewrite it generates is hardcoded to Sentry's
  // SaaS ingest and ignores `sentryUrl` above. Verified in the build output:
  //
  //   destination: https://o:orgid.ingest.:region.sentry.io/api/:projectid/envelope/
  //
  // Enabling it would quietly forward this app's error payloads to sentry.io,
  // a third party we have not chosen and have no agreement with, instead of to
  // Watchtower. Do not add it back. If ad blockers ever turn out to be dropping
  // events, the fix is our own route handler under app/api/ that forwards to
  // Watchtower, which is what this codebase does for every other upstream
  // anyway.
  //
  // No `disableLogger` either. It is deprecated in v10, and its replacement
  // (webpack.treeshake.removeDebugLogging) is a webpack option that Turbopack
  // does not support. This build is Turbopack, so there is nothing to set.
});
