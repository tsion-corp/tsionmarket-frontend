---
date: 2026-09-11
feature: The Explore market is back on staging
scope: prediction, sportsbook proxy, prediction-combos proxy
scenario-impact: updated
---

# The Explore market is back on staging

## What changed

The 2.0 port (#431) dropped the Explore market, in its commit "drop the
Explore market from the 2.0 build", because it reads a prediction service the
production gateway does not serve. The staging gateway serves it, so it
returns to staging.

- **"Explore all markets" is back on `/prediction`**, beside the Polymarket
  and Local switch, on the Polymarket tab. It opens `/prediction/markets`.
- **`/prediction/markets` is back:** the sportsbook with every sport, league
  and live odds, and the Politics, Crypto, Finance, Tech, Culture and Economy
  boards (`?category=`), with the category drawer.
- **`/prediction/markets/:eventId` is back**, the page for one market with
  all its outcomes.
- **Cards link into it again.** A Polymarket card on the desk, the phone
  prediction banner and the dashboard's prediction cards open the market's own
  page when the feed gives it a category. The rest keep today's destination.
- **The `/api/sportsbook` and `/api/prediction-combos` proxies are back**,
  with their allowlists, session checks and response contracts, and the
  cross-tab sync for the combos queries.

## Fixed on the way back

- **The sportsbook board could not load on staging.** It asked for the odds
  of all 24 games in one request; the provider took 83 s for that, past the
  proxy's 45 s limit. It now asks in batches of four, all at once, and waits
  for the slowest batch. Measured on staging: one game about 3 s, four about
  6 s, 24 in parallel batches about 26 s.
- **The cashout confirmation** passes `open` to the shared confirm dialog,
  whose contract changed after Explore was removed.
- **A dead font reference** to the removed sportsbook face is gone; the pages
  use the app's body font, as the rest of the app does since the port.

## Left out on purpose

Forty-seven files of an older markets workspace, and the thirteen tests of
those files, are not restored: nothing in the tree before the removal reached
them either. The temporary `/market-preview` page is not restored.

## Follow-up for the backend

`POST /v1/prediction/sportsbook/events/markets` is slow and grows faster than
its batch: 8 games took 29 s, 24 took 83 s. Caching the provider's market
lists would make the sportsbook open in a few seconds.

## Not on production

Nothing here reaches `main`.

## Tests

- `features/prediction/components/prediction-view.test.tsx` (new): the button
  on the Polymarket tab, not on Local or the full list; the cards' links.
- `features/prediction/sportsbook/api/client.test.ts` (new): odds requested
  in batches of four and merged per game; a failed batch fails the board.
- Restored suites for the markets, sportsbook, schemas, proxies and pages.
- `prediction-mobile.test.tsx`, `predictions.test.ts`: the market-page links.
