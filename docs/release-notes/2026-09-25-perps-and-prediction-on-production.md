---
date: 2026-09-25
feature: Perpetuals and Prediction are offered on production
scope: release
scenario-impact: needs_automation
---

# Perps and Prediction go live on production

Prediction was withdrawn from production on 2026-09-17 in #517 because the
gateway could not serve it. Perpetuals has never been offered there: the desk
was held on staging while it was exercised. Both are offered today, on every
device, and `HIDDEN_NAV_SECTIONS` is empty for the first time.

## Why now

#517 hid Prediction for a backend reason, not a product one: the gateway's
`prediction` service answered 502 on api.tsionark.com, so the sportsbook, combo
and Explore routes had nothing to call. That is fixed. Both services were
checked against production before this change rather than assumed:

| Service      | Endpoint                         | Result                       |
| ------------ | -------------------------------- | ---------------------------- |
| `prediction` | `sports/filters`                 | 200, live sports and leagues |
| `prediction` | `sports/combo-filters`           | 200, live combo filters      |
| `prediction` | `sports/events?sport=basketball` | 200, 6 fixtures              |
| `prediction` | `sports/combo-events`            | 200, 3 events                |
| `prediction` | `markets/events`                 | 200, 10 events               |
| `perp`       | `ark/assets`                     | 200, the full asset registry |
| `perp`       | `ark/prices`                     | 200, live marks              |
| `perp`       | `ark/market-contexts`            | 200, live contexts           |

Perps was never blocked on any of that. #517's own note recorded it as "a
product decision rather than a backend one", and that decision is reversed.

`prediction-market`, the separate service behind user-created markets, answers
200 but currently holds no markets. That is an empty list rather than a
failure, and the desk draws its empty state. It is worth watching: the Explore
and sportsbook surfaces carry the page today.

## How

The Prediction half is a revert of #517, which is the change that hid it, so it
already names every surface: the desktop rail and phone drawer
(`HIDDEN_NAV_SECTIONS`), the phone Market tabs (`HIDDEN_TABS`), the dashboard
row and banner, the explore banner, and the doorway on Polymarket collateral in
portfolio and holdings. The browse routes are real pages again rather than the
redirect stubs #517 left.

Two files had moved on `main` since #517 and were resolved by hand:

- `dashboard-page.tsx`, because #562 gave the Arkade the lead on the phone
  shelves. The Arkade keeps that lead; `PredictionStartsRow` returns to the
  slot it held before #517, directly above Token Moves.
- `mobile-market-view.test.tsx`, which asserted both sections were absent.

The Perps half is three changes on top:

- `HIDDEN_NAV_SECTIONS` is emptied, which is the only switch the rail, the
  drawer, the marquee and the dashboard's brief order read.
- `HIDDEN_TABS` in `mobile-market-view.tsx` is emptied, so the Leverage tab is
  dealt again and a `?tab=perps` link opens the desk instead of falling back to
  Spot.
- `OwnMarketRow`, the perps shelf, is composed on the dashboard again: after
  Find the next 100X on the phone, and beside the conversation band on desktop,
  which is where the design draws it and where staging carries it.

#517's release note is kept. It is the record of why Prediction came off, and
this note is the record of why it went back.

## Tests

The suites that asserted the hidden state now assert the offered one, rather
than being deleted:

- `mobile-market-view.test.tsx`: the strip is the full catalogue, so the tab
  indices shift by one and Leverage takes the second seat. "Never mounts the
  perps desk" becomes "mounts the perps desk on the Leverage tab and nowhere
  else", which still covers the mount-on-demand behaviour that made the desk
  cheap to leave closed.
- A separate case keeps the unoffered-tab fallback covered with a tab id that
  names nothing. Emptying `HIDDEN_TABS` would otherwise have removed the only
  test exercising it.
- `perps-menu-drawer.test.tsx`: the drawer offers Perpetuals, and the rail
  lights it on `/perps` rather than lighting nothing.

Full suite: 6846 passed, 3 skipped. Typecheck clean. Production build clean.
Lint reports no new warnings, and one fewer than `main` (the restore puts
`portfolio-view`'s `router` back in use).
