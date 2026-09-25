---
date: 2026-09-17
feature: Memecoin catalogue and trending caching, table UX, and the trending rail's view
scope: meme, trade, dashboard-feed, pagination, i18n
scenario-impact: updated
---

# Memecoin catalogue and trending caching, table UX, and the trending rail's view

The memecoin service was taken down by the frontend's own request volume. This
change cuts that volume, makes the lists complete and honest about what they
hold, and reworks the desk's controls.

## Why

Trending polled every 30 seconds in `useTrendingMemes` and every 120 seconds in
`useTrendingBoard`, against a gateway that rate limits per IP, and every reader
shares the Next.js server's IP. `docs/adr/ADR-2026-09-15-meme-trending-screener.md`
predicted this outcome in writing before it happened.

## What changed

### Request volume

- Both trending reads now run on a ten minute timer, paused in a hidden tab and
  while the strip is off screen, plus a refresh the reader presses. That control
  reloads the page, because both lists are deliberately cached for the tab and a
  reload is the only thing that genuinely refreshes what is on screen.
- The catalogue is walked whole and held for the tab: `staleTime: Infinity`,
  `gcTime: Infinity`, no refetch on mount, focus or reconnect, and excluded from
  the localStorage snapshot so a reload is a real read.
- The walk paces itself, backs off on 429 honouring `Retry-After`, and stops
  visibly rather than dying. A stalled walk now offers a way to resume; nothing
  called `progress.retry()` before.
- Every remaining meme poll backs off when the service stops answering, without
  shortening any interval: a failing read is asked for less often, never more.

### The trending rail

The rail ran the `curated` view, which admits only LOW and MEDIUM risk. Every
row from `/tokens/trending` comes back `UNKNOWN`, so the rail kept none of them
and served 40 arbitrary Base coins under a Trending heading on every single
load. It had not shown a trending coin since curated was applied.

It runs the `all` view now. That turns off every guard, not only the risk
filter: measured against the live feed, 83 of 100 trending rows hold less than
the $10,000 liquidity floor curated enforces. Thin liquidity on a memecoin is an
exit problem. The cost was put to the maintainer with the numbers, alongside the
alternative of relaxing the risk filter alone (17 rows, floors intact), and
`all` is what they chose. The catalogue, grids, phone list and screener list are
untouched and still curated.

### The table and the strip

- Trending pages three cards, not four, on a grid rebuilt with container
  queries: the old `auto-fit` rule drew two cards and a half width orphan at
  three.
- The count and "Load more" row is gone from all four surfaces. Pagination
  covers everything held and grows as pages land. `MemeGrid` previously hid the
  pager until rows overflowed one page, so a barely loaded catalogue rendered as
  a finished list.
- Figures are compacted so they stop overflowing their cells. `compactUsd` was
  doing `Number(value)` on a decimal string and rendering a live price of
  `1.21e-9` and a liquidity of `0.004` both as `$0`.
- Sort and Filter open modals rather than popovers, with a dialog role, focus
  trapped and returned to the trigger, and Escape to close.
- Search reaches contract address, pair address, age, market cap, price, volume,
  liquidity, venue and chain, matched over the cached catalogue with no request.
  Solana addresses stay case sensitive.

### Ported from `main`, two of them widened

- `rankableHere` keeps the strip off coins with nothing to rank. Ours also reads
  the flat `priceChange24hPercent`, which main's version misses, so rows whose
  card would show a figure are no longer dropped.
- The impossible change guard refuses figures like the 2.8e19 percent the
  service reported on 2026-09-16. Ours also guards the flat field, which main's
  leaks straight back through `changeFor`'s fallback.
- "Try again" resets the circuit breaker before retrying, so it reaches the
  network instead of being refused in process.
- The catalogue keeps a first page in sessionStorage so one failed page stops
  blanking the desk. Held as a render fallback rather than `initialData`, which
  on a never stale query would mean a reload that reads nothing.

### Proxy boundary

`lib/server/dashboard-feed.ts` parsed nothing: it cast raw upstream JSON to
`MemeToken` and kept any finite change, so the dashboard could show a figure the
rest of the app refuses. It now goes through `parseTokenPage`, the same boundary
the client uses, so there is one threshold in one place.

## Tests

- `lib/meme/search.test.ts`, `lib/meme/format.test.ts`, `lib/meme/trending-shown.test.ts`,
  `lib/meme/parse.test.ts`, `lib/meme/api.test.ts`, `lib/meme/api.chain.test.ts`
- `features/trade/hooks/use-meme-tokens.test.tsx`, `use-meme-screener.test.tsx`,
  `use-meme-catalog-session.test.tsx`
- `features/trade/components/` suites for the grid, strip, sort menu, filters,
  search input, table columns, bits and the unavailable panel
- `app/(session)/(app)/meme/page.test.tsx`, `mobile-market-view.test.tsx`
- `components/ui/list-pagination.test.tsx`
- `lib/server/dashboard-feed.test.ts`
- `./scripts/preflight.sh` green: 538 files, 5,320 tests, zero lint errors, five
  locale catalogues in parity.

## Follow-ups, not in this change

- `/tokens` and `/tokens/trending` clamp `limit` to 100 while documenting 500.
  At 146,242 rows that is 1,463 pages, which is what makes holding the whole
  catalogue impractical.
- Every trending row is `riskLevel: UNKNOWN` and 83% sit under the liquidity
  floor, which reads as a data gap upstream.
- `priceLabel` (`features/trade/components/meme-bits.tsx`) still does
  `Number(priceUsd)` on a money amount, and returns the missing-data dash for a
  genuine zero price.
- Several `lib/server/` readers still cast raw upstream JSON without validation,
  including `rwa-prices.ts` and `portfolio-holdings.ts`, which carry money.
