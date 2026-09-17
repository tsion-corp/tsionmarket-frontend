---
date: 2026-09-17
feature: www.tsionark.com/square shows the real Market Square app
scope: feat
scenario-impact: none
---

# /square is the Square itself now

`/square` used to be this app's own read-only view of Market Square: the Home feed, read through our relay. It is now the **real Square app**, the same one at square.tsionark.com, served on this domain as a Next.js Multi-Zone.

## How it works

- `next.config.ts` rewrites `/square` and `/square/:path*` to the Square's own deployment, read from `SQUARE_ZONE_URL` (e.g. `https://square-ark.vercel.app`). The rewrite is `beforeFiles`, so nothing here can shadow it.
- That deployment is built with `NEXT_PUBLIC_SQUARE_BASE_PATH=/square`, so its pages, API, images, scripts and styles all answer under `/square`. The standalone square.tsionark.com is a separate build of the same repo and is untouched.
- `app/(session)/(app)/square/page.tsx` is removed: the zone owns that path.
- Every way into the Square is a **full page load** in the same tab (`lib/square-zone.ts`). This build has no route there any more, so a `next/link` or `router.push` would ask it for a page it doesn't have. That covers the desktop rail entry, the phone dock's Square seat, `useAppNavigate`, and discovery pills that point at `/square`.
- `/api/square/*` is a different prefix and stays this app's own API.

## Env

`SQUARE_ZONE_URL` on the wsws Vercel project: an https origin with no path. Without it (local dev without the zone), `/square` is not found here. A value with a path fails the build instead of routing somewhere wrong.

## The way back

The Square's Ark build carries its own "Back to Ark" affordance (market-square-frontend), modelled on the mobile app's.
