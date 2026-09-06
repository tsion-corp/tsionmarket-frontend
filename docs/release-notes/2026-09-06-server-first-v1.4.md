---
scenario-impact: updated
---

# Release Note: v1.4, server-first reconstruction of the signed-in app

## Summary

The signed-in app now paints from the server. One shell is mounted once for the
product routes, the session is verified from the Privy cookie on the server so
the page shows at the first byte, the balance and the dashboard's public data
are composed on the server and streamed into the query cache, and the pages
that never sign in no longer download the wallet SDK. Two security defects were
fixed on the way, and the client's circuit breaker is now one per upstream
service.

Decision record: `docs/adr/ADR-2026-09-06-server-first-reconstruction.md` and
its plain-English companion.

## What changed

- **Security.** The server now checks that a client-supplied Privy identity
  token names the same user as the verified access token before trusting it
  for wallet ownership (`lib/server/auth.ts`). The persisted query cache is
  emptied whenever the session is signed out, so a shared browser holds no
  balances after sign-out (`components/providers/session-cache-guard.tsx`).
- **Shell.** `app/(session)/(app)/layout.tsx` mounts `DashboardShell` once for
  dashboard, spot, perps, memecoins, real assets, prediction and activity. The
  rail's highlight is derived from the path (`lib/sections.ts`) and the
  dashboard overrides it from its scroll position. The group has `loading.tsx`
  and `error.tsx`.
- **Providers.** `app/(session)/layout.tsx` owns Privy, the broadcast session
  and analytics. The landing page and the privacy policy went from 1,270 kB and
  1,255 kB of gzipped JavaScript to 249 kB and 182 kB.
- **Session on the server.** `lib/server/session.ts` verifies the `privy-token`
  cookie under React's `cache`. The `(app)` layout hands the browser the user id
  and wallet addresses; `AuthGuard` shows the page at once when the server
  vouched, and `usePortfolio` keys on those wallets until Privy is ready.
- **Balance in the HTML.** `lib/server/portfolio-snapshot.ts` prefetches the
  session's balance and `components/providers/query-hydration.tsx` streams it
  into the query cache under the key the browser builds.
- **Dashboard feed.** `lib/server/dashboard-feed.ts` composes the four briefs
  and the marquee's live events once per twenty seconds for everyone, served
  by `GET /api/dashboard/feed` with `public, s-maxage`. The briefs and the
  marquee read it through one query. An idle dashboard makes one public
  request every thirty seconds where it made thirteen, and upstreams that are
  down are never asked from a browser.
- **Circuit breaker per service.** A dead chess gateway no longer opens the
  breaker for the balance or raises the app-wide banner
  (`lib/api/circuit-store.ts`).
- **Polling.** The perps brief stops polling off screen, the Kash sheets read
  nothing while closed, the marquee feeds never retry, the analytics segment
  listens to the cache instead of polling, and the deposit catalog warms its
  four chains in parallel.
- **Layout stability.** Skeletons carry the geometry of what replaces them
  (`components/ui/skeleton-line.tsx`, the balance card, the holdings, the
  preview rows).
- **Bundle budget.** `scripts/first-load.mjs` measures the initial JavaScript
  per route and `pnpm bundle:check` fails CI over budget.
- **Rules lifted to `lib/`.** RWA listing, chess live-match, the vault contract
  read, spot and perps composition and meme normalisation now live below the
  feature line so the server applies the same rules as the browser.

## Verification

- `./scripts/preflight.sh` gates: Prettier, ESLint, TypeScript, Vitest (246
  files, 2,128 tests), production build, `pnpm bundle:check` all pass.
- Every route probed on the dev server after each structural move (route
  group, session group, dashboard split): all 200, URLs unchanged.
- First-load JavaScript measured before and after each bundle change with
  `pnpm bundle:report`; numbers above are from those runs.
- Full dashboard server-rendered with a faked server session to prove the
  tree survives SSR: 265 kB of HTML, no error boundary.
- `GET /api/dashboard/feed` served live: 8 spot, 6 perp, 8 meme, 8 RWA rows;
  20 ms from cache.

## Scenario impact

`updated`: the signed-in dashboard, the sign-in redirect, the balance load and
the dashboard briefs behave differently on first paint (server-rendered, no
loader before the shell). Sign-out now clears stored balances. The playbook
scenarios for "open the dashboard", "sign out on a shared device" and "a game
gateway is down" should be re-recorded.

## Review fixes (PR #374)

- `useSessionWallet` no longer falls back to the server's wallet once Privy is
  ready: a signed-out browser, or a user without a wallet on a chain, gets
  Privy's answer alone. Regression tests cover both.
- The feed's chain-round pot label is built from `formatEther`, an exact
  decimal, instead of a float division of wei. Test covers a pot that a float
  would round.
- The circuit summary now notifies subscribers when only the failure count
  changes, which could happen once an open circuit's backoff reached its
  ceiling. Test covers it.
- Not changed: the production-build guard on `NEXT_PUBLIC_PRIVY_APP_ID` in
  `next.config.ts`. It predates this branch and is deliberate; CI supplies the
  variable and does not run `preflight.sh`. See the PR discussion.

## Known limits

- The on-chain live-round read inside the feed was not observed with an
  active game locally; it degrades to no rounds on any failure and logs the
  cause.
- Casino and earn still mount the shell per page; they are outside the
  `(app)` group.
- Open PRs that edit `app/dashboard/page.tsx` or `app/perps/page.tsx` must be
  rebased onto this branch, since those files moved under
  `app/(session)/(app)/`.
