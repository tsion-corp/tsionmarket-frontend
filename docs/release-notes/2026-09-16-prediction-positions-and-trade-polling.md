---
date: 2026-09-16
feature: The prediction page offers Load positions again, and the memecoin polls back off when a service is down
scope: fix
scenario-impact: none
---

# Load positions returns, and the polls stop hammering a service that is down

Two problems, one branch. Both are about the same thing: what the app asks of a
backend, and when.

## The prediction page had no way to see your positions

Before the 2.0 merge, the prediction page carried a "Your positions" panel: a
Load positions button, and once pressed, your open bets with claim, sell and
cash out. After the merge it was gone, and users noticed.

Nothing was deleted. `PredictionPositions` survived the merge intact, but its
only importer was `prediction-market-list.tsx`, and no route renders that file.
The panel was orphaned, not removed.

`trending-markets-feed.tsx` is what `/prediction` actually renders, so the panel
is mounted there, above the market list rather than under it. Somebody who opened
the page to check an open bet, claim a win, or cash out should not have to scroll
a feed to find it.

The controller behind it holds no query and polls nothing. It is plain state plus
a refresh callback, so mounting it costs the prediction service **zero requests**
until somebody presses Load. That is the same on-demand behaviour the old panel
had, and it is deliberate: reading positions requires the trading session, and we
do not want to trigger onboarding just from viewing the page.

The panel is a card inside the section gutter, so it takes the section's padding
rather than the list's full-bleed rows. At phone width the header and footer rows
wrap, every text column truncates, and nothing carries a fixed pixel width.

## The memecoin polls kept asking a dead service

The backend team reported the frontend calling the trade service every five
seconds. That was accurate, and it came from the interface this one replaced:
`hooks/use-portfolio.ts` on the pre-merge `main` carried

```ts
const INCOMPLETE_POLL_MS = 5_000;
refetchInterval: (query) => (query.state.data?.missing?.length ? INCOMPLETE_POLL_MS : pollMs);
```

with no page gate, so any tab anywhere in the app re-asked `/api/portfolio` every
five seconds for as long as a holding failed to price, and `/api/portfolio`
server-side calls the trade service. The 2.0 merge already fixed that: 30 seconds,
and only on the balance page. Nothing here reverts.

What was still missing is what happens when the service is genuinely down.

**Client side.** Seven poll sites now go through `pollUnlessFailing`, which drops
a query's interval to 60 seconds once it is failing and restores the normal
cadence when it recovers: the swap feed (15s), trending tokens (30s, two sites),
the screener refresh (120s), and the three memecoin portfolio queries (60s).
`lib/query-poll.ts` had no test before this branch; it has one now.

**Server side.** `lib/server/meme-positions.ts` is the module `/api/portfolio`
uses to reach the trade service, and it had no memory between requests: every
inbound request tried the upstream again regardless of how the last ten went.
It now counts consecutive failures and, after three, stops asking for 60 seconds.

Making that work meant a real fix rather than a flag. `readPage` previously
returned an empty page for both "the service said you hold nothing" and "the
service refused", which are not the same thing; it now returns `{ items, total, ok }`
so a refusal is distinguishable and a refusal is what trips the counter. A success
clears it.

`TIMEOUT_MS` drops from 8 seconds to 5. The status page puts the trade service's
healthy p95 at roughly 834 ms and its degraded threshold at 2.5 s; an 8 second
ceiling only ever held a request open on an upstream that was never going to answer.

## What this does not change

- No polling cadence gets faster. Every change here makes the app ask for less.
- The client circuit breaker in `lib/api/circuit.ts` is untouched. The server-side
  backoff is a second, independent layer, because the circuit breaker lives in the
  browser and `/api/portfolio` runs on the server, where it never applied.
- No new user-facing strings, so no locale changes.

## Verification

`./scripts/preflight.sh`: all five gates pass.

New tests:

- `lib/server/meme-positions.test.ts` — stops calling after the threshold, asks
  again after the cooldown, forgets failures on success.
- `lib/query-poll.test.ts` — five cases for the helper.
- `features/prediction/components/trending-markets-feed.test.tsx` — the Load
  positions button is present, `refresh` is **not** called on mount, and the panel
  precedes the market list in document order.

Updated: `prediction-view.test.tsx` now asserts the panel is offered above the
market list instead of asserting it is absent. `category-markets.test.tsx` gained
the same provider and controller stubs.

Exercised on `localhost:3001`. The prediction page renders the panel at the top of
the section, and pressing Load reaches the prediction service rather than firing on
mount.
