---
date: 2026-09-11
feature: The Kash card asks the engine far less often
scope: portfolio, kash proxy
scenario-impact: updated
---

# The Kash card asks the engine far less often

## What changed

The backend team reported heavy traffic from the frontend to the Kash
engine. The source was the Kash card on the home page: every signed-in
person's landing page read their account every thirty seconds, uncached,
plus a fresh read on every hop back to the page, plus twelve reads after
any Kash action. One person on the home page cost the engine about 120
calls an hour.

- **The account poll is five minutes**, down from thirty seconds. It only
  exists for credits from outside the app; the person's own actions refresh
  the card themselves. The poll still pauses in a background tab and the
  card still refreshes on return to the tab.
- **A figure read in the last thirty seconds is reused.** A hop to another
  page and back, or two cards on the same page, no longer re-read it.
- **An action refreshes only what it can have changed**: the account
  balance, now and after the two chain-settle re-checks, plus the ledger,
  and the subscription after an upgrade. The engine status and the tier
  catalogue are no longer refetched three times per action. Twelve calls
  per action becomes three.
- **The proxy caches wallet reads for two seconds** and collapses reads in
  flight together, so a second tab or a double mount costs the engine one
  call. The cache is keyed by the exact URL and consulted only after the
  session has been checked against the wallet in it, and a write for the
  wallet drops its entries so the refresh after an action reaches the
  engine.

- **The Kash+ history modal is the staging one.** Two tabs, Transactions
  and Activity Points. The points tab says "Coming soon" with a line that
  activity earnings are not live yet and transactions are in the other tab,
  so an empty history is not read as trades going uncounted. Transaction
  rows show the hash with a copy control and a Basescan link for burns,
  sends and receives; mints show none. Brought over from staging at the
  maintainer's request on 2026-09-11, with the copy button's small size.

## Cost of one person on the home page

|                                     | Before       | After           |
| ----------------------------------- | ------------ | --------------- |
| On arrival                          | 3 calls      | 3 calls         |
| Sitting on the page                 | 2 per minute | 1 per 5 minutes |
| Back from another page              | 1 call       | 0 within 30 s   |
| After a buy, convert, claim or send | up to 12     | 3               |
| An hour on the page                 | about 120    | about 15        |

## Tests

`features/portfolio/hooks/use-kash-poll.test.tsx` (the five-minute poll,
the remount stale time, the background pause and the catch-up on return),
`use-kash-invalidate.test.tsx` (what an action refetches and what it does
not), `app/api/kash/[...path]/route.test.ts` (the wallet cache, in-flight
collapse, the drop on write, and that another session is never served a
cached wallet), `kash-history-modal.test.tsx` (the two tabs, the coming-soon panel, which
rows show a hash).

## Follow-up for the backend

Folding the subscription tier into `GET /accounts/:wallet` would make the
card one read on arrival instead of two.
