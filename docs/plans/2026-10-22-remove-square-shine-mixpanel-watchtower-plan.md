# Plan: Remove Square, Shine, live broadcast, Mixpanel and Watchtower

- **ADR:** [ADR-2026-10-22-remove-square-shine-mixpanel-watchtower](../adr/ADR-2026-10-22-remove-square-shine-mixpanel-watchtower.md) (Accepted 2026-10-22)
- **Branch:** `chore/remove-square-shine-analytics`, from `staging` @ `cc20704b`
- **Maintainer answers:** broadcast is removed; the avatar keeps only the generated pattern; Clarity stays.

Each step leaves `pnpm typecheck`, `pnpm lint` and the affected tests green
before the next starts. Paths are from the removal maps taken against
`cc20704b`; line numbers drift as steps land, so each step re-reads before
editing.

## Step 1: Shine

Shine posts confirmed trades, bets and wins to the user's Square feed through
`createSquarePost`.

- **Delete:**
  - `lib/shine/`, `components/shine/`, `components/providers/shine-runtime.tsx`
  - `features/migrate/components/shine-runtime-under-migration.tsx`, `hooks/use-shine.ts`, `app/api/preferences/`
  - Per-feature modules: `features/rwa/lib/shine.ts`, `features/trade/lib/shine-trade.ts`, `features/casino/lib/shine/`, `features/casino/hooks/use-arcade-shine.ts`, `features/prediction/lib/shine.ts`, `features/prediction/sportsbook/shine.ts`, `features/prediction/sportsbook/hooks/use-sportsbook-shine.ts`
  - All their tests, including `*.shine.test.tsx`.
- **Edit:** remove the `reportShine` / `useArcadeShine` / `useSportsbookShine` calls in:
  - trade: buy-sheet, hyperliquid-pro-perps, hyperliquid-positions-list, use-spot-buy, use-meme-trade
  - rwa: use-rwa-ticket, rwa-settlement-tracker
  - prediction: bet-modal
  - casino: use-arkjet, use-chicken, checkers-play, last-standing-section, arkball-section, play-section, lichess-round
- **Edit the Shine menu entries:**
  - dashboard-shell, account-popover, account-modal, app-modals
  - `ShineIcon` in `components/ui/icons.tsx`
  - the runtime mount in `app/(session)/providers.tsx`
- **Check:** `readDecanePreferences` stays if consent still uses it.

## Step 2: Live broadcast

- **Delete:**
  - `components/broadcast/`, `hooks/use-broadcast-room.ts`, `lib/broadcast/`
  - casino: `features/casino/components/broadcast/`, `chess-app/broadcast/` (live video), `hooks/use-game-broadcast.ts`, `hooks/use-chess-broadcast.ts`, `lib/chess/broadcast.ts`
- **Confirm before deleting:** each chess file is LiveKit or Market Square broadcast, not a Lichess watch feature. Lichess TV and game viewing stay.
- **Edit:**
  - the mounts in `app/(session)/providers.tsx`, `dashboard-shell`, `sidebar`, `last-standing-section`, `play-section`
  - the activity broadcast entries in `lib/activity/{entries,feed}.ts` and the activity row and sheet
- **Remove dependencies:** `@livekit/components-react`, `livekit-client`.

## Step 3: Square

- **Delete:**
  - `features/square/`, `lib/square/` (after moving `avatar-seed.ts` to `lib/avatar/avatar-seed.ts`)
  - `lib/market-square.ts`, `lib/square-zone.ts`, `lib/api/services/square.ts`, `lib/api/market-square*.ts`, `lib/api/schemas/market-square.ts`
  - `app/api/square/`, `app/api/market-square/`
  - `components/share/{square-composer,share-to-square,composer-tools}.tsx`, `features/portfolio/components/market-square-banner.tsx`
  - `features/discovery/hooks/use-live-conversations.ts`, the Square, GoLive and Feed cards in `conversation-cards.tsx`
  - public assets: `public/market-square/`, `public/square-home/`, `public/market/square-banner/`, `public/nav/market-square.svg`, `public/rollout/nav/icon-marketsquare.svg`
- **Edit:**
  - **Dashboard:** `dashboard-page.tsx` (the tab, promos, compose FAB). The `useSpotMarkets` poll stays only if `?buy=` needs it.
  - **Portfolio:** `portfolio-view.tsx`.
  - **Navigation:**
    - `sidebar.tsx` and `nav-items.tsx`
    - `curved-tab-bar.tsx`: re-balance `SEATS` and `CENTRE` without the Square tab, and check it on a phone
    - `lib/sections.ts`, `use-app-navigate.ts`
  - **Discovery:** `discovery-cta.tsx`, `conversation-row.tsx`.
  - **Shared code:**
    - `lib/query-keys.ts`, `lib/api/circuit-store.ts`
    - `next.config.ts` (`squareZoneRewrites` and the `beforeFiles` line)
    - `move-old-money-panel.tsx` (the Square rekey notice)
  - **Legal text:** `app/terms/content.ts`.
- **Avatar:**
  - `components/ui/square-avatar.tsx` becomes `components/ui/account-avatar.tsx`, seeded from the account.
  - `hooks/use-square-avatar.ts` (`fetchSquareMe`) is deleted. Its callers (topbar, sidebar, account-popover, account-modal, spin-da-bottle, leaderboard, last-standing) use the seed.
- **Tests:** delete the tests for deleted code; edit the mocks in the sidebar, tab-bar, topbar, account, buy-sheet, conversation-row, activity-detail-sheet and sections tests.

## Step 4: Mixpanel

- **Delete:**
  - `lib/analytics/{mixpanel,schema,relay,insert-id,trade-amounts,failure-reason,game-result,page-name,auth-method}.ts`
  - `lib/analytics/events.ts`, after moving the `KycStatus` and `UserTier` types Clarity uses into `clarity.ts`
  - `lib/server/mixpanel-relay.ts`, `app/api/relay/`
  - `components/providers/analytics-{identity,segments}.tsx`
  - feature analytics helpers: `features/trade/lib/perp-analytics.ts`, `features/casino/lib/{arkjet,chicken}-analytics.ts`, the deposit, bank-deposit and bank-withdraw analytics trackers, `use-onramp-settlement.ts`
  - their tests, including `__tests__/mixpanel.test.ts`
- **Keep:**
  - `self-initiated.ts`, `deposit-watch.ts` and `useDepositBalanceRefresh`. `DepositAnalytics` becomes `DepositBalanceRefresh` and keeps only the refresh.
  - Before deleting `environment.ts`, check whether anything else uses it.
- **New:** `components/providers/clarity-identity.tsx` carries the `identifyClarity` and `tagClaritySession` calls that today live in the two deleted providers. Test: it identifies a signed-in user and tags the session.
- **Edit:**
  - all 187 `track()` calls and the `identifyUser`, `resetAnalytics`, `setSuper` and `setProfile*` calls
  - `instrumentation-client.ts` (`initAnalytics`, `reportPage`)
  - `proxy.ts` (`RELAY_PATH` and `isAnalyticsRelay`)
  - `NO_AUTOCAPTURE_CLASS` (a Mixpanel class name; Clarity masking is checked separately)
  - the comment in `app/r/[username]/route.ts`
  - `app/privacy/content.ts` (Mixpanel lines, `LAST_UPDATED`)
- **Feature tests:** about 26 tests mock `track`. Drop only the mock and the `track` assertions; every behavior assertion stays.

## Step 5: Watchtower

- **Delete:**
  - `lib/analytics/watchtower.ts`, `instrumentation.ts`, `app/api/monitoring/`, `app/api/heartbeat/`
  - their tests
  - the `vercel.json` `crons` block
- **Edit:**
  - `instrumentation-client.ts` (`Sentry.init`, `captureRouterTransitionStart`)
  - `next.config.ts`: drop `withSentryConfig` and `UPLOAD_SOURCEMAPS`; the export becomes `withNextIntl(nextConfig)`
  - `lib/api.ts`, `use-meme-trade.ts` and its test
- **Error pages:** `app/error.tsx` and `app/global-error.tsx` call `console.error(error)` from their effect. Red-green: a test that renders each with an error and expects `console.error` to be called fails first, then passes.
- **Remove dependency:** `@sentry/nextjs`.
- **Stale comments to fix:** `lib/analytics/relay.ts` (already deleted), the trade route, `lib/errors.ts`, `lib/errors.test.ts`.

## Step 6: Locales, env, budgets, docs

- **Locales:** `messages/{en,de,es,fr,pt}.json` lose the `square` and `shine` namespaces and the single keys from the map (`account.shine`, `buySell.shareToSquare`, `discovery.square*`, the GoLive and Feed card keys, `migrate.square.*`, the broadcast keys). Every removal is applied to all five files, and a script checks that the five key sets still match.
- **Env:** `.env.example` drops every variable listed in the ADR.
- **Budgets:** `scripts/first-load-budget.json` budgets are lowered to the measured new sizes.
- **Docs:** README and `CONTRIBUTING.md` mentions are updated. Old ADRs stay as history.

## Step 7: Verify, document, deliver

- `./scripts/preflight.sh` passes with zero warnings.
- `git grep -iE "mixpanel|sentry|watchtower|shine|market-?square|livekit"` matches only docs and the Lichess watch features.
- Manual run on the dev server covers:
  - sign in and the dashboard
  - the mobile tab bar
  - account menu and avatar
  - a deposit (the balance refreshes), a trade, a bet
  - Arkade, chess and checkers
  - all five locales
- Write the release note `docs/release-notes/2026-10-22-remove-square-shine-mixpanel-watchtower.md`.
- Write the ship script for the maintainer. It opens a PR to `staging`, then a PR to `main` built by bringing `main` level the usual way (`main` lacks Checkers, so Checkers-only edits are dropped).
