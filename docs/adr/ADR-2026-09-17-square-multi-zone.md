# ADR-2026-09-17: /square serves the real Market Square app (Next.js Multi-Zone)

## Status

Accepted on 2026-09-17. The maintainer (ogazboiz) chose this in conversation: www.tsionark.com/square should show the Square app itself, square.tsionark.com must stay untouched, and people must be able to move between Square and the rest of Ark. It supersedes ADR-2026-09-12 (square-page-in-app) for the `/square` route, and replaces the Vercel microfrontends plan in #506 for Square.

## Context

- `/square` rendered this app's own read-only copy of the Square Home (ADR-2026-09-12). Every Square feature (chat, gist rooms, houses, stories, profiles) lived only at square.tsionark.com, so Ark users met a partial Square.
- Rebuilding the Square here, as the mobile app did, would mean two copies of every Square feature, drifting apart.
- An iframe breaks the address bar, history and sign-in, and the Square refuses framing.
- Vercel microfrontends need a team-level group and the `@vercel/microfrontends` package on both sides. Next.js Multi-Zones reach the same result with one rewrite.

## Decision

1. `next.config.ts` rewrites `/square` and `/square/:path*` (in `beforeFiles`) to `SQUARE_ZONE_URL`, keeping the `/square` prefix in the destination.
2. The Square repo builds a second deployment with `NEXT_PUBLIC_SQUARE_BASE_PATH=/square`, which serves every page, API route, file, script, style and optimised image under `/square`. square.tsionark.com remains a separate, unprefixed build.
3. `app/(session)/(app)/square/page.tsx` is removed: the zone owns that path.
4. Every entry into `/square` is a full page load in the same tab (`lib/square-zone.ts`): the rail row, the dock seat, `useAppNavigate` and discovery pills. A client transition would ask this build for a route it no longer has.
5. `/api/square/*` stays this app's own API (a different prefix).

## Consequences

- One Square codebase serves both addresses, so every Square change ships to Ark automatically.
- Crossing between Ark and Square is a full page load. The shared `@ark/chrome` (#507) is what makes it read as one product. Until then, the Square's Ark build carries a "Back to Ark" affordance.
- A missing `SQUARE_ZONE_URL` means `/square` is not found here. A malformed value (with a path, or not https) fails the build rather than routing somewhere wrong.
- `features/square` (the old in-app Home) is no longer reachable from `/square`. Its removal is a separate clean-up.
