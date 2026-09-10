import packageJson from "./package.json";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Links the next-intl request config (i18n/request.ts) into the build. The app
// localizes via a cookie, not locale URLs, so routing is untouched.
const withNextIntl = createNextIntlPlugin();

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
  env: { NEXT_PUBLIC_APP_VERSION: packageJson.version },
  // Powerball became ArkBall. Shared links and bookmarks to the old slug still
  // land on the game.
  async redirects() {
    return [{ source: "/casino/powerball", destination: "/casino/arkball", permanent: true }];
  },
  // Pin the Turbopack root to this project. Otherwise Next walks up the tree,
  // finds the stray ~/package-lock.json, and treats the whole home directory as
  // the workspace root — so Turbopack watches far more of the filesystem than it
  // needs to (and prints a "multiple lockfiles" warning on every start).
  turbopack: {
    root: import.meta.dirname,
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

export default withNextIntl(nextConfig);
