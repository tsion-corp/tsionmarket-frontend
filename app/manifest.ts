import type { MetadataRoute } from "next";

// The web app manifest, emitted by Next at /manifest.webmanifest and linked
// from the root layout's metadata.
//
// This exists for Web Push, not for an offline app. On iOS and iPadOS, Web
// Push only exists for a site installed to the Home Screen, and that install
// is only offered when a manifest declares `display: "standalone"`. Without
// this file the entire iOS audience cannot receive a notification. It also
// exempts the app from Chrome's automatic revocation of notification
// permission on low-engagement sites.
//
// The brand name is written here rather than translated: "Ark" is the product
// name and is deliberately absent from the locale catalogues.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ark",
    short_name: "Ark",
    description:
      "The onchain superapp for global markets. Own stocks, gold, crypto and real-world assets from one self-custody account, funded in Naira.",
    start_url: "/",
    display: "standalone",
    // The page's own black (html and body in app/globals.css), so the install
    // splash matches what loads behind it.
    background_color: "#000000",
    // --color-topbar. That band is what sits under the browser and status bar
    // chrome this colour tints.
    theme_color: "#232323",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // A separate maskable entry rather than "any maskable" on the icons
      // above: a launcher mask would crop the rounded plate they already
      // carry, so the maskable art is drawn full-bleed with its own safe zone.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
