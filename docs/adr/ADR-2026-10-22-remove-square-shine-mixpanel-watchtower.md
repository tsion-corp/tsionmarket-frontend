# ADR: Remove Square, Shine, live broadcast, Mixpanel and Watchtower from market

- **Status:** Accepted 2026-10-22
- **Deciders:** the maintainer
- **Delivery:** one branch, `chore/remove-square-shine-analytics`, cut from `staging`, shipped to `staging` and then to `main`
- **Related:** [ADR-2026-10-22-cloudflare-workers-hosting](./ADR-2026-10-22-cloudflare-workers-hosting.md), which this unblocks

## Context

The team is moving the market frontend to Cloudflare Workers on the **Free
plan**: 100,000 Worker requests a day and 10 ms of CPU per request. Vercel's
last 30 days for `wsws` were 3.6M function invocations (about 120,000 a day)
and 70 ms P75 active CPU, so the app has to get lighter before it can fit.

The team has also decided, for product reasons, that four things leave market:

| What               | What it does today                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Square**         | Market Square social feed: dashboard tab, composer, share buttons, nav entries, a zone at square.tsionark.com served through `next.config.ts` rewrites.   |
| **Shine**          | Auto-posts a confirmed trade, bet or game win to the user's Square feed. Built on Square's `createSquarePost`, so it cannot outlive Square.               |
| **Live broadcast** | Going live and the speaker queue in casino games and chess (LiveKit), backed by the Market Square service. Removed with Square so no Square calls remain. |
| **Mixpanel**       | Product analytics. Every event goes browser → `/api/relay` → api.mixpanel.com, so each event is a function invocation.                                    |
| **Watchtower**     | Sentry-compatible error and uptime monitoring. Errors go browser → `/api/monitoring` (tunnel); an hourly Vercel cron hits `/api/heartbeat`.               |

Microsoft Clarity stays: it is browser-only and adds no server requests.

## Decision

Remove all five in one branch, in this order so every commit builds and
tests green:

1. **Shine** (depends on Square): `lib/shine/`, `components/shine/`,
   `components/providers/shine-runtime.tsx`, `hooks/use-shine.ts`,
   `app/api/preferences/`, the per-feature `shine` modules
   (trade, rwa, prediction, sportsbook, casino) and every `reportShine` call.
2. **Live broadcast**: `components/broadcast/`, `hooks/use-broadcast-room.ts`,
   `lib/broadcast/`, the casino go-live panel, the LiveKit video room and the
   game broadcast hooks; `@livekit/components-react` and `livekit-client`.
   Chess features that only _watch_ Lichess games are not broadcast and stay;
   the plan confirms the boundary file by file.
3. **Square**: `features/square/`, `lib/square/`, `lib/market-square.ts`,
   `lib/square-zone.ts`, `lib/api/market-square*`, `app/api/square/`,
   `app/api/market-square/`, share-to-Square components, the portfolio banner,
   nav and tab-bar entries, dashboard tab, `next.config.ts` rewrites, public
   assets.
   - The account avatar keeps its generated pattern
     (`avatar-seed.ts` moves to `lib/avatar/`); the Square profile-photo
     lookup goes.
4. **Mixpanel**: `lib/analytics/mixpanel.ts` and the modules that only feed it
   (`events`, `schema`, `relay`, `insert-id`, `trade-amounts`,
   `failure-reason`, `game-result`, `page-name`, `auth-method`),
   `lib/server/mixpanel-relay.ts`, `app/api/relay/`, the two analytics
   providers, 187 `track()` calls in 82 files, `mixpanel-browser`.
   - Kept: `self-initiated.ts`, `deposit-watch.ts` and the
     `useDepositBalanceRefresh` part of `DepositAnalytics`, because the
     portfolio refresh on deposit depends on them. Clarity's identify and
     session tags move out of the deleted providers into a small Clarity
     provider. Types Clarity borrowed from `events.ts` move into `clarity.ts`.
   - `proxy.ts` drops its relay exemption.
5. **Watchtower**: `lib/analytics/watchtower.ts`, `instrumentation.ts`,
   `app/api/monitoring/`, `app/api/heartbeat/`, the `vercel.json` cron,
   `withSentryConfig` in `next.config.ts`, `@sentry/nextjs`.
   - `app/error.tsx` and `app/global-error.tsx` report only to Sentry today,
     inside an empty `catch`. They change to `console.error(error)` so a crash
     is never silent.

### Also changed

- **Locales** (`messages/{en,de,es,fr,pt}.json`): the `square` and `shine`
  namespaces and the single keys listed in the plan, in all five files.
- **Legal text:** `app/privacy/content.ts` stops naming Mixpanel and Sentry
  (bump `LAST_UPDATED`); `app/terms/content.ts` drops the Square section.
- **Env vars removed:** `NEXT_PUBLIC_MIXPANEL_TOKEN`,
  `NEXT_PUBLIC_WATCHTOWER_DSN`, `WATCHTOWER_ORG`, `WATCHTOWER_PROJECT`,
  `WATCHTOWER_AUTH_TOKEN`, `CRON_SECRET`, `SQUARE_ZONE_URL`,
  `NEXT_PUBLIC_MARKET_SQUARE_URL`, `NEXT_PUBLIC_MARKET_SQUARE_LIVE`,
  `NEXT_PUBLIC_SQUARE_FEATURED`, plus any LiveKit ones. `.env.example`
  updated; Vercel copies left alone until the move.
- **Tests:** tests for removed code are deleted with it; about 26 feature
  tests that mock `track` or `@/lib/shine` lose those mocks and assertions,
  never the behavior they test.
- `scripts/first-load-budget.json` budgets lowered to the new sizes.

## Consequences

- **Fewer requests:** every analytics event (`/api/relay`), error report
  (`/api/monitoring`), heartbeat, Square and broadcast call stops reaching the
  server. Measured on the Cloudflare free deploy, not assumed.
- **Less CPU per request:** the Sentry server SDK no longer wraps every
  request and route.
- **Smaller bundles:** mixpanel-browser, the Sentry SDK and LiveKit leave the
  client.
- **We lose:** product analytics and funnels (Clarity recordings remain),
  error alerts and the uptime check (the separate uptime.tsionark.com status
  page is unaffected), social posting and live video.
- Users who had Shine switched on simply stop posting; the stored preference
  is ignored. Existing Square posts stay in the Square backend, which this
  repo no longer calls.
- A future error or analytics tool gets its own ADR; nothing here blocks one.

## Verification

- `./scripts/preflight.sh` clean (format, lint, typecheck, tests, build).
- `git grep -iE "mixpanel|sentry|watchtower|shine|market-?square|livekit"`
  returns only docs and the Lichess watch features.
- On the staging preview: sign in, dashboard, portfolio, a deposit (balance
  refreshes), a trade, a bet, Arkade games, chess and checkers, the account
  menu and avatar, every locale, the mobile tab bar layout without the Square
  tab.

## References

- Removal maps produced 2026-10-22 against `staging` @ `cc20704b`, recorded in
  the implementation plan.
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
