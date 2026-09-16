---
date: 2026-09-16
feature: The 2.0 interface reaches production, minus four features production cannot serve
scope: release
scenario-impact: needs_automation
---

# The 2.0 interface reaches production

`staging` merges into `main`: the 2.0 shell, the Market Square page, the
discovery home, the deposit and withdraw redesign, the Arkade hub redesign, the
chess results and review work, the memecoin slices, and The Last Man on the v5
vault in USDC.

Four features stay behind, and this note is mostly about how.

## What is not offered, and why

The decision was made per feature against what the production gateway can
actually serve. Live probes of `api.tsionark.com` on 2026-09-16:

| Feature               | Gateway service    | Production | Why it is held back                                 |
| --------------------- | ------------------ | ---------- | --------------------------------------------------- |
| Prediction            | `prediction`       | **502**    | The backend is down. Not a choice.                  |
| Arkjet, Pilot Chicken | `arkjet`           | **502**    | The backend is down. Not a choice.                  |
| Perpetuals            | `perp`             | 200        | Product decision. The desk is exercised on staging. |
| Checkers              | `chess` (draughts) | 200        | Product decision.                                   |

`prediction-market` is a different service and is live in production. It makes
no difference: **nothing prediction ships**, whichever service it would have
called. That was the instruction, and it is stronger than the 502 that prompted
it.

## How they are held back

Nothing is deleted. Every route, slice and component stays wired, so restoring
any of them is uncommenting rather than rebuilding.

**One switch per surface, never a scattering of conditionals.**

- `HIDDEN_NAV_SECTIONS` in `lib/sections.ts` now lists `perps` and
  `prediction`. `buildNav` is its single reader, so the desktop rail, the phone
  drawer, the marquee and the dashboard's brief order all drop them together.
- `HIDDEN_TABS` in `features/trade/components/mobile-market-view.tsx` lists the
  same two for the phone `/market` strip. `TABS` stays the full catalogue so
  `TabId` still names every tab; only the strip the reader is offered is
  filtered. A `?tab=perps` link falls back to Spot rather than opening a tab
  with nothing behind it.
- `CASINO_GAMES` in `features/casino/lib/games.ts` has Checkers, Arkjet and
  Pilot Chicken commented out, and the home shelf in
  `features/discovery/components/arkade-row.tsx` drops the same three cards.
- `liveEventsFrom` in `lib/dashboard-feed.ts` no longer chips live Checkers
  matches. The feed still carries them; the marquee must not advertise a table
  the hub does not list.

### Nothing prediction, in full

The nav switch alone would have left prediction code running on production, so
the removal goes further than the other three:

- **Nine proxy routes deleted**: `/api/prediction`, `/api/predictions`,
  `/api/prediction-combos`, both `/api/sportsbook` routes, and all four
  `/api/polymarket` routes. That takes the Polymarket builder-signing secret
  off production with them.
- **Unmounted from every signed-in route.** `PredictionCashoutTracker` polled
  on every page in `app/(session)/providers.tsx`, and
  `usePredictionQueryBroadcast` ran beside it. Both are gone.
- **No portfolio doorway.** A pUSD holding used to offer "Manage in
  Prediction". The **balance still shows** — hiding money somebody owns would
  be worse than a section they cannot reach — but it is now an ordinary
  holding with no prediction action.
- Nothing outside `features/prediction/` imports it any more.

The slice itself and its routes stay in the tree as redirects, so the section
comes back by restoring files from git rather than by rebuilding.

**Routes whose backend is down redirect; routes whose backend is live do not.**
A page that would fail every request is worse than a page nobody is pointed at,
so `/prediction*`, `/casino/arkjet` and `/casino/chicken` redirect. `/perps`
and `/casino/checkers` still serve: their services answer, they are simply not
offered a way in.

## The Last Man is back

The 2026-09-15 hide said the vault service settled v5 while this app opened
games on v4. Production's vault now reports `v5` at
`0xc14e74724eC79977Abe9Cc1c0dfaD9E160bAD1e0` with ETH and USDC, and the merged
app speaks v5 in USDC. The tile, the routes, the marquee chips and the pop-out
host's Arkade branch all come back together.

## Known degradation: the memecoin screener

The screener's filters and its timeframe metrics ship, but production's trade
service is an older build. `/v1/trade/tokens/trending` there returns 200 for
the filter parameters and ignores them, and its rows carry no `activity`,
`chart` or `pairCreatedAt`. So age, transactions, traders, per-timeframe volume
and the sparkline have no data, the client fallback can only sort and filter on
price and market cap, and a bound on a missing metric empties the table because
nulls are excluded from bounds by design.

`lib/meme/parse.ts` handles the absence without crashing, so nothing breaks.
The feature simply means little until the trade service is redeployed to
production.

## Verification

`./scripts/preflight.sh` clean: 5,096 tests. Service reachability was probed live rather
than read from the OpenAPI document, because staging's gateway and production's
register different services: `rwa`, `earn`, `kash` and `ramping` are live in
production and unreachable on staging, and `market-square` serves 143 paths in
production against staging's 96.
