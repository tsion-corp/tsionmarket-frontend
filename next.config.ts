import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Links the next-intl request config (i18n/request.ts) into the build. The app
// localizes via a cookie, not locale URLs, so routing is untouched.
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Pin the Turbopack root to this project. Otherwise Next walks up the tree,
  // finds the stray ~/package-lock.json, and treats the whole home directory as
  // the workspace root — so Turbopack watches far more of the filesystem than it
  // needs to (and prints a "multiple lockfiles" warning on every start).
  turbopack: {
    root: import.meta.dirname,
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
    ],
  },
};

export default withNextIntl(nextConfig);
