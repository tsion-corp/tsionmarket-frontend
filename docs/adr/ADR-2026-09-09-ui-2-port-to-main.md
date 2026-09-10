# ADR-2026-09-09: Bring the 2.0 UI to production by merging staging and removing what production cannot serve

## Status

Accepted and built, 2026-09-09. Authorized by the maintainer on the plan
below; the branch `ui/2.0` carries the merge and every removal, each with
a passing preflight from the Arkade step on. The maintainer's own changes
and the pull request are still to come.

What differed from the plan as written, recorded here rather than rewritten
above:

- The removals ran in the order 2, 3, 1, 4, 5, 6, so the two sections that
  held the merged tree's only type errors went first and every later step
  had a fully green preflight, build included.
- The dry-run merge was wrong: `hooks/use-portfolio.ts` and
  `lib/server/activity.test.ts` conflicted with #427 and were resolved by
  hand, and six bare `refetchFresh` / `refetchUntilChanged` calls from
  staging were scoped as #423 requires.
- `app/api/polymarket` stays whole, relayer included, and so does
  `lib/polymarket/config.ts`: the prediction desk's own trading client uses
  the relayer, so neither was Explore-only as step 1 assumed. The
  `/trade/[symbol]` route and the PnL card model went with perps; the
  unused perps service client went with real assets.
- Real assets: the server registry and price modules stay, so a token
  already held still shows and is priced; its sheet offers no trade.
- The bottom tab bar's second icon opens the spot desk, the section its
  marker already claimed, in place of the deleted Market page. The three
  public preview routes are gone. `/vault`, `/welcome` and `/privacy` ship.
- Lint: 50 warnings became 33. The 30 raw image tags in the new UI and the
  three React Compiler notes on the table component are left for the
  maintainer.

## Context

The 2.0 UI was built on `staging` (#422 and the work around it) against
the `wsws-test` project, whose `WSAPI_BASE_URL` points at the staging
gateway. Measured on 2026-09-09:

|                                                                                   |                                                                       |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| staging ahead of main                                                             | 99 commits, 856 files, ~82k lines added                               |
| staging behind main                                                               | 0 commits after #427 was cut in; the dry-run merge is clean           |
| sections that need a backend production does not have, or that are not wanted yet | perps, RWA changes, the Explore market and `/market`, Arkjet, Chicken |

Two ways to get the same branch were weighed. Porting section by section
moves about 650 files by hand, discovers each hidden dependency when a
half-ported section fails to compile, and has to pass preflight in every
intermediate state. Merging staging and removing the excluded sections
moves nothing by hand, lets the typechecker list every dangling import
the moment a folder is deleted, and leaves a review surface that is only
the difference between staging and the branch, since the UI itself was
reviewed on its way into staging.

## Decision

1. **Branch `ui/2.0` off `main`, merge `origin/staging` into it once.**
   The dry-run merge (`git merge-tree`) reports no conflicts. Preflight
   runs on the merged tree before any removal so the baseline is known.
2. **Remove the excluded sections, one commit each, preflight after
   each**, in this order:
   1. Explore market: `features/prediction/markets`,
      `features/prediction/sportsbook`, `house-slip-store.ts`, the five
      Explore-only components (`category-bet-sidebar`,
      `category-event-detail`, `category-event-row`,
      `category-market-shared`, `politics-markets-shell`), the routes
      `app/(session)/prediction/markets/**`, `app/(session)/market`,
      `app/(session)/market-preview`, the proxies `app/api/prediction-combos`,
      `app/api/sportsbook`, `app/api/polymarket/relayer` and
      `lib/polymarket/config.ts` (its only caller), and the schemas
      `lib/api/schemas/prediction-combos*`, `lib/api/schemas/sportsbook.ts`.
      `features/prediction/gamma-category.ts` stays: the base prediction
      page imports `predictionDetailHref` from it and nothing else from
      the cluster. The new tab bar's `/market` tab is repointed or removed
      (the maintainer's call, see the plan).
   2. Perps, entirely. Production hides its perps today and the branch
      carries none: not the Hyperliquid terminal staging added and not the
      desk `main` has. Deleted: `app/(session)/perps`,
      `app/api/perp/[...path]/route.ts`, `lib/perp/**`, every
      `features/trade/**/hyperliquid-*` and `perp*` and `perps-*` file
      (components, hooks, lib, tests), `enter-the-arena-banner.tsx`,
      `token-moves-promos.tsx`, and the five perp assets under `public/`.
      Shared files that reference them are edited, not deleted:
      `dashboard-page.tsx` (the perps brief and overview),
      `mobile-market-view.tsx`, `features/trade/index.ts`,
      `features/trade/lib/pnl-card.ts`, `lib/sections.ts`,
      `lib/dashboard-feed.ts`, `lib/server/dashboard-feed.ts`,
      `components/layout/feature-marquee.tsx`,
      `features/discovery/components/conversation-row.tsx`. The typecheck
      lists any other.
   3. Arkade: `app/(session)/casino/arkjet`, `app/(session)/casino/chicken`,
      `features/casino/components/arkjet/**`, `features/casino/components/chicken/**`,
      `features/casino/hooks/use-arkjet*.ts`, `use-chicken.ts`,
      `features/casino/lib/api/arkjet.ts`, `app/api/arkjet`,
      `__tests__/arkjet-route.test.ts`, `public/casino/arkjet/**`,
      `public/casino/chicken/**`, and the two entries in
      `features/casino/lib/games.ts` and the casino page. Arkball, Chess,
      Checkers and Last Man Standing keep their restyled versions.
   4. RWA, entirely. Production hides RWA today and the branch carries
      none. Deleted: `app/(session)/(app)/rwa`, `app/api/rwa`,
      `app/api/rwa-chart`, `app/api/rwa-prices`, `features/rwa/**`,
      `lib/rwa/catalog.ts`, `lib/server/rwa-prices.ts`,
      `lib/server/rwa-registry.ts`, `lib/api/schemas/rwa*`,
      `lib/api/services/rwa.ts`, `__tests__/rwa-market-live.test.ts`,
      `public/market/sidebar-icon-rwa.svg`. Shared files edited:
      `dashboard-page.tsx` (the RWA brief), `components/layout/modals/app-modals.tsx`,
      `lib/analytics/page-name.ts`, `lib/sections.ts`. The portfolio's
      settlement tracking for RWA buys goes with it; a Solana holding bought
      through RWA still shows in the portfolio, because the balance read is
      independent of the RWA feature.
   5. Preview routes: `app/topbar-preview`, `app/promo-rail-preview`,
      `app/prediction-mobile-preview` deleted.
   6. Redirect: `/dashboard` to `/portfolio` becomes `permanent: false`
      for the first production release, so a rollback is not fought by
      browser caches; flipped to permanent once 2.0 has held.
3. **Then the maintainer's own changes**, as further commits on the same
   branch, each with preflight.
4. **One pull request to `main`**, reviewed as the diff from `origin/staging`
   to `ui/2.0` (the removals and the changes) rather than the diff from
   `main`. The maintainer merges.

```
main (#427) ──► ui/2.0 ──merge staging──► [full 2.0 UI]
                                            │ remove Explore   (preflight)
                                            │ remove perps     (preflight)
                                            │ remove Arkjet+Chicken
                                            │ remove RWA
                                            │ remove previews
                                            │ soften redirect
                                            │ maintainer's changes
                                            ▼
                                       PR to main
```

## Not excluded, and why

- `app/api/payment` and the remit off-ramp already exist on `main`;
  staging only edits them. The production gateway currently reports the
  payment service unreachable, which is a production fact, not a port
  question.
- `NEXT_PUBLIC_PREDICTION_API_URL` and `NEXT_PUBLIC_WS_GATEWAY_URL` are
  read on `main` today with the same fallbacks; nothing in the kept code
  needs them set. `NEXT_PUBLIC_PERP_WS_URL` loses its last reader with
  perps.
- `hooks/use-portfolio.ts` differs by two lines on staging; the merge
  keeps #423 and #427 intact, and the plan checks that file by hand.

## Open decisions for the maintainer

- The `/market` tab in the new bottom tab bar: point it at `/prediction`,
  or remove the tab.
- `/vault`, `/welcome`, `/privacy`: three new public pages with no
  backend. In or out.

## Consequences

- Production gets the whole 2.0 UI in one release, minus five sections, with perps and RWA absent rather than hidden,
  with every excluded section still available on `staging` to port later
  as a small change.
- `staging` should stop receiving UI work the moment the merge lands, or
  new work should go to `ui/2.0` directly; otherwise the two drift and a
  second merge reintroduces deleted files as modify-delete conflicts.
- Verification: preflight after the merge and after every removal; the
  Vercel preview of `ui/2.0` walked page by page against the exclusion
  list; `git diff origin/staging..ui/2.0 --stat` reviewed as the whole
  change.

## Amendment, 2026-09-09 (later the same day)

Real assets returned. The removal in step 4 was reverted once the gateway's
`rwa` and `gas-sponsor` services were confirmed live in production (see the
release note `2026-09-09-dashboard-discovery-cards.md`, "Real assets
return"), and the navigation switch that hid the section on main was
emptied. Perps and the Explore market remain out; `/v1/perp/*` still
answers not found.
