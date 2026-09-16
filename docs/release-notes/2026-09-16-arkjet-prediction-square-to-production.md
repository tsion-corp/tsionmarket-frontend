---
date: 2026-09-16
feature: Prediction, Arkjet, Pilot Chicken and the Square page reach production
scope: release
scenario-impact: needs_automation
---

# Prediction, Arkjet and the Square page reach production

The second production migration. The previous release (#503) held four features
back; two of them were held back because the production gateway could not serve
them. Those two backends are now live, so the features follow.

## What changes

| Feature               | Gateway service | Production | State after this release     |
| --------------------- | --------------- | ---------- | ---------------------------- |
| Prediction            | `prediction`    | 200        | **Offered**                  |
| Arkjet, Pilot Chicken | `arkjet`        | 200        | **Offered**                  |
| Square page           | `market-square` | 200        | **Offered** (env, see below) |
| Perpetuals            | `perp`          | 200        | Still held back              |
| Checkers              | `chess`         | 200        | Still held back              |

Perpetuals and Checkers are product decisions, not backend ones, and they do not
change here.

## The backends, verified live

Probed against `api.tsionark.com` on 2026-09-16. Both services were 502 at the
previous release; both now register in the gateway's OpenAPI document (`arkjet`
40 paths, `prediction` 55) and answer on the routes the app actually calls:

```
prediction/sportsbook/capabilities        200
prediction/sportsbook/navigation          200
prediction/sportsbook/gas-info            200
prediction/markets                        200
prediction/combos/eligible-markets        200
prediction/sports/filters                 200
arkjet/rounds/current                     200
arkjet/capabilities                       200
arkjet/chicken/rules                      200
arkjet/fairness/rules                     200
market-square/profiles                    200
market-square/topics                      200
```

The gateway's unreachable list is now `ai, crosschain, payment, nft, paymaster`.
None of them is read by anything in this release.

## Prediction

The previous release did not gate prediction, it removed it: nine proxy routes
were deleted and eight page routes were replaced with redirects to `/dashboard`.
This release restores all of them from `staging`, unchanged:

- `app/api/prediction/[...path]`, `app/api/predictions`,
  `app/api/prediction-combos` (with its response cache),
  `app/api/sportsbook` and `app/api/sportsbook/reference-volumes`,
  `app/api/polymarket/{access,deposit-address,relayer,sign}`
- the `/prediction` pages: the market list, a market, an event, the markets
  index, the event detail and reclaim

Every one of those proxies derives its upstream from `WSAPI_BASE_URL` through
`wsapiService()`. No per-service override is set on the production project, so
they all resolve against the production gateway.

`app/api/polymarket/sign/route.ts` carries the builder-signing secret. All three
values (`POLYMARKET_BUILDER_API_KEY`, `_SECRET`, `_PASSPHRASE`) are already set
on the production project and were not added here.

The section also comes back in the shell:

- `prediction` comes off `HIDDEN_NAV_SECTIONS` in `lib/sections.ts`, which
  `buildNav` is the single reader of, so the desktop rail, the phone drawer, the
  marquee and the dashboard's brief order all offer it together
- `prediction` comes off `HIDDEN_TABS` in `mobile-market-view.tsx`, so the phone
  market strip deals the tab and hands off to `/prediction`
- `PredictionCashoutTracker` and `usePredictionQueryBroadcast` are mounted again
  in `app/(session)/providers.tsx`
- the portfolio's Polymarket-collateral doorway returns in `portfolio-view.tsx`
  and `holdings-modal.tsx`
- `PredictionStartsRow` and its `usePredictionSpots` hook return to the
  dashboard, and the prediction doorway returns to `ExploreBanners` and to
  `INTERLEAVED_BANNERS`

## Arkjet and Pilot Chicken

Both entries are uncommented in `CASINO_GAMES`, both cards return to the home
Arkade shelf, and both routes serve their real pages again instead of redirecting
to `/casino`. They share one gateway service, `arkjet`, and it is live.

## The Square page

**No code change.** The `/square` page, the `features/square` slice, the rail
seat and the `app/api/market-square` relay all shipped to `main` in the previous
release and are byte-identical to `staging`. The page is off in production for
one reason only:

```
NEXT_PUBLIC_MARKET_SQUARE_LIVE="false"    # on the wsws project, Production
```

`MARKET_SQUARE_HIDDEN` in `lib/market-square.ts` reads that switch, the sidebar
reads `MARKET_SQUARE_HIDDEN` for its seat, and `/square` renders nothing while it
is true. Setting the variable to `true` and redeploying is the whole of shipping
the Square page. `NEXT_PUBLIC_MARKET_SQUARE_URL` is already
`https://square.tsionark.com` and is unaffected.

`NEXT_PUBLIC_*` values are inlined at build, so this needs a redeploy rather than
a restart. It is a separate, reversible step from the merge, and it is the
operator's to run.

`SQUARE_SECTIONS_HIDDEN` is a different switch and is NOT touched: the square's
sections on the portfolio stay off, as asked for.

## What still stays out, and how

Two visibility switches, unchanged in mechanism:

- **Perpetuals** — `"perps"` is the sole remaining entry in
  `HIDDEN_NAV_SECTIONS` and in `HIDDEN_TABS`. `OwnMarketRow` stays uncomposed on
  the dashboard. `/perps` still serves the desk; nothing in the shell offers a
  way to it.
- **Checkers** — its `CASINO_GAMES` entry stays commented out, its card stays off
  the Arkade shelf, and `liveEventsFrom` still drops checkers chips from the
  marquee so no chip links to a game the hub does not list.

Everything behind both stays wired. Restoring either is uncommenting its entry;
nothing else changes.

## Tests

No assertion was deleted. The eight cases that asserted the old production shape
were rewritten to assert the new one:

- `features/casino/lib/games.test.ts` — "offers no Checkers, Arkjet or Pilot
  Chicken" narrows to "offers no Checkers", and a new case pins Arkjet and Pilot
  Chicken after ArkBall with their real hrefs
- `features/discovery/components/arkade-row.test.tsx` — the shelf now deals five
  cards, Checkers still absent
- `features/trade/components/mobile-market-view.test.tsx` — the strip is four
  tabs again; the Prediction tab hands off to `/prediction` without taking
  selection, and a legacy `?tab=prediction` link is repaired to the route
- `features/trade/components/perps-menu-drawer.test.tsx` — the drawer offers
  Prediction and still does not offer Perpetuals
- `__tests__/proxy-path-security.test.ts` — the prediction proxy's traversal case
  returns with the route

`./scripts/preflight.sh` passes all five gates.
