---
date: 2026-09-17
feature: Prediction is withdrawn from production until it relaunches, without stranding anyone's funds
scope: release
scenario-impact: needs_automation
---

# Prediction comes off production again

Prediction reached production on 2026-09-16 in #504. It is withdrawn today, on
every device, until it relaunches.

## How

#504 is the change that brought it in, so it already names every surface. This
restores the prediction half of #504 and nothing else: the Arkjet, Pilot Chicken
and Square parts of that release stay. None of the restored files has changed on
`main` since #504, so restoring their earlier state loses no later work.

A sweep of every `/prediction` link outside the prediction feature matched
#504's file list exactly, so no entry point was added afterwards and missed.

| Surface                                                             | Now                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------- |
| Desktop rail, mobile drawer                                         | `HIDDEN_NAV_SECTIONS` is `["perps", "prediction"]`            |
| Phone Market tabs                                                   | `HIDDEN_TABS` is `["perps", "prediction"]`                    |
| Dashboard                                                           | no prediction row, no prediction banner                       |
| Explore banners                                                     | no prediction banner                                          |
| Portfolio and holdings                                              | Polymarket collateral still shows, with no prediction doorway |
| `/prediction`, `[id]`, `event/[id]`, `markets`, `markets/[eventId]` | redirect to `/dashboard`                                      |

The redirects are the same stubs production ran before #504. Under the `(app)`
group the layout streams through `<Suspense>`, so the redirect arrives as a
`NEXT_REDIRECT` payload the client router follows; a browser lands on
`/dashboard`, and a raw HTTP client sees a 200. `markets/[eventId]` sits outside
that group and answers a plain 307.

## What deliberately stays

Prediction was live for a day, so some people may now hold positions or money in
flight. Three things stay because removing them could strand funds, and none of
them is reachable from the interface.

- **`/prediction/reclaim` stays live.** It is no longer just a prediction page:
  it lets a winner on the superseded contract redeem their own shares, and only
  that winner can. It was never linked from navigation.
- **`PredictionCashoutTracker` stays mounted.** It reconciles a Dextopus
  delivery after a cashout. It does nothing unless the signed-in wallet has a
  cashout pending (`if (relevant.length === 0) return;`), so it costs everyone
  else no request, and removing it could lose the delivery status of money in
  transit.
- **The prediction, sportsbook and Polymarket API routes stay.** Nothing in the
  interface calls them any more, so they receive no traffic, and reclaim depends
  on them.

## Known gap

Someone who placed a bet on 2026-09-16 and still holds an **open position** has
no screen to cash it out or claim it from while prediction is hidden. The money
is not lost; the positions sit on Polymarket and reappear when prediction
relaunches. If that window is long, a positions-only route is the thing to add.

## Relaunching

Restore these files from #504 (`32a7e036`) and take `"prediction"` out of both
switches. `perps-menu-drawer.test.tsx` will fail until it is updated again, which
is the reminder.

## Verification

`./scripts/preflight.sh`: all five gates pass, 5,138 tests.

`perps-menu-drawer.test.tsx` asserted Prediction was in the drawer and failed on
this change. It now asserts it is absent, with the history in its comment.

Exercised on `localhost:3001`: every browse route redirects, reclaim does not,
and `/dashboard`, `/market` and `/portfolio` render no `/prediction` link. The
only remaining mention on those pages is the translation catalog serialized for
next-intl, which is data rather than rendered interface.
