---
date: 2026-09-15
feature: Trending strip and market screener on the memecoin desk and phone tab
scope: trade/memecoins
scenario-impact: updated
adr: docs/adr/ADR-2026-09-15-meme-trending-screener.md
plan: docs/plans/2026-09-15-meme-trending-screener-plan.md
---

# Trending strip and market screener on the memecoin desk and phone tab

The memecoin desk (`/meme`) and the phone Memecoins tab now lead with a
Trending strip and a screener bar above the coin list. On the desk the rail
(pair header, chart, metrics, ticket) is unchanged and stays on the right.
Everything new sits in the left column with the table.

## What a trader sees

- **Trending.** The service's trending coins, four a page with their own
  pager: one row on a wide desk, two by two on a narrow column or a phone. A
  card shows:
  - its rank;
  - the price, flashing when it changes;
  - the gain or loss over the chosen window;
  - a what-if line ("$100 → $112.34");
  - a momentum tag (🚀 Mooning, 🔥 Pumping, 🧊 Cooling, 🩸 Dumping);
  - a heat bar comparing its volume with the busiest coin on the board.

  Tapping a card selects the coin into the rail on the desk and opens the meme
  ticket on a phone.

- **Time window.** 5m, 1h, 6h, 12h or 24h. The change on the cards and in the
  list follows it. A window the providers have not filled shows `—`, never 0
  and never another window's figure.
- **Sort.** Market cap, price, age, transactions, volume, traders or liquidity,
  either direction ("Newest first" and "Oldest first" for age). When the sort
  metric is not already a column, the desk adds a column for it and the phone
  adds the value to the name line.
- **Filters.** Five quick picks (Fresh launches, Big movers, Micro caps, Deep
  liquidity, Crowd favourites) and min/max bounds for all seven metrics.
  - Bounds accept `250k`, `1.5m` and `2b`.
  - Nothing is sent until **Apply**, and an invalid bound disables it.
  - Each applied bound and the sort show as removable chips.
  - A note explains that coins without data for the chosen window are left out
    of a window-scoped filter.
- **Trending follows the filters.** Bounds narrow Trending too. The sort only
  reorders the list, so Trending stays ranked by activity.
- **Search still wins.** While a search is showing, the list shows its results
  and the bar says filters are paused.
- The top three gainers on the visible list page carry a 🔥.

## Curated and All

The switch now opens on **All**, on the desk, the phone tab and the grid.

Curated keeps only coins rated Low or Medium, which are buy-enabled, hold at
least $10,000 of liquidity and $100 of 24h volume, and are not on the manual
hidden list. It was the desk's only protection when there was nothing to filter
with, and it narrowed the market before a trader asked. The screener now does
that job in the open and to the trader's own thresholds, so Curated is a filter
to turn on rather than a default.

Two places keep Curated whatever the desk opens on, because they have no view
switch beside them and an unrated coin should not arrive there unasked: the
dashboard's trending cards (`fetchTrendingTokens`) and the pro coin picker
(`fetchTokenCatalog`). They now name the view instead of taking the default.
`isMemecoinHere` and `tradableHere` keep `curated` as their own default for the
same reason.

## The desk on a tablet

Between 768px and 1023px the desk used to scroll sideways: the rail is a fixed
468px and the table asks for about 360px, so the two never fitted a tablet.
Trending and the screener bar made a cramped column worse.

From 1024px up nothing changes, and the ticket stays on the right. Below it the
two columns stack: Trending, the screener bar and the table take the full
width, and the rail with its chart and ticket follows underneath. Picking a
coin still loads it into that ticket; on a tablet it is below the table rather
than beside it.

Phones are unchanged: below 768px the market page still hands off to the phone
view.

## Trending at narrow widths

The strip used to draw four cards across whatever room it had. At about
1024px, where the left column is near 480px, that left each card 110px and the
rank, coin and change were crushed into a column. The cards now size
themselves: as many whole cards as fit at 156px or wider, wrapping to a second
row when they do not. A wide desk still shows one row of four, a narrow column
shows two by two, and the strip keeps its 172px as a floor rather than a cap.

A phone uses that same grid, four cards a page drawn two by two. It scrolled
them sideways at first, which cut the card at the screen edge: a reader saw two
whole cards and a third sliced down the middle, which reads as broken rather
than as an invitation to swipe. Every card on a page is now whole, and the
pager moves between pages. A loading card stands exactly as tall as a real one,
so the list below does not jump when trending lands.

The screener bar is a 36px row with a floor rather than a fixed height. The
timeframe track and the two buttons come to about 460px, and at 1024px the
desk left column is near 480px, so a row that could not wrap drew Sort and
Filters over each other. It wraps now, and the table below simply fits fewer
rows.

These sizes are written out in the components rather than built from their
constants, because Tailwind only generates a class it can read as plain text in
the source. Tests hold the two in step.

## How it reaches the service

- `GET /tokens?page=N&limit=500&<screener>` while a filter or sort is applied.
  Otherwise the list uses the catalogue exactly as before.
- `GET /tokens/trending?limit=100[&<bounds>]` for the strip.
- The query string is canonical (sorted keys, canonical parameter names, and
  `timeframe` only when a window-scoped bound or sort needs it), so equal
  filters share one cache entry.
- Results are cached for the browser tab in `sessionStorage`
  (`wsws.meme-screener.*`, at most 12 entries):
  - A combination seen in the last minute paints with no request.
  - Up to five minutes old, it paints and refreshes in the background.
- Trending refreshes every two minutes, only while the strip is on screen and
  the tab is visible.
- The phone view asks for nothing while another market tab is open.
- The new query keys (`meme-screener`) are not in the localStorage snapshot.
  The catalogue's existing persistence is unchanged.

## Contract details this change relies on

Checked against `apps/trade` on `tsionark-monorepo` `origin/main`:

- Trending cannot be paged by the server, so the app pages the 100 it receives.
- A filtered read scans the whole catalogue whatever the page size, which is
  why a page is 500 rows.
- There is no "amount" parameter.
- The service returns no validation errors for bad screener values, so the app
  validates every bound itself.
- `activity` and `pairCreatedAt` are now read from list and trending rows.
  - At the proxy boundary a count may be any number, and the parser reads a
    fractional or negative count as unavailable. An odd provider value
    therefore cannot fail the whole catalogue page, which served fine before
    these fields were read.
  - Money and percentages must still be strings.

## Known backend issues (reported, not fixed here)

1. Re-ingest drops `activity` and `pairCreatedAt`, so most coins show `—` for
   5m to 12h and are left out of transaction, trader and age filters.
2. Unfiltered `/tokens` pages have no unique tiebreaker.
3. Unfiltered trending ranks the most recently updated coins, not the top by
   24h volume.
4. `chart` keeps the first 120 points, not the latest.
5. llms.txt says `GET /tokens` triggers discovery; the controller does not.
6. Invalid screener values are accepted silently.

## Strings

A new `memeScreener` namespace (78 keys) is in all five catalogues. No existing
key changed.

## Scenario impact

`updated`. A scenario on `/meme` or the phone Memecoins tab now meets the
Trending strip and the screener bar above the list:

- A scenario that counts list rows at a fixed window height sees fewer rows on
  the first page.
- A scenario that reads the change column at the default 24h window sees the
  same values as before.

## Tests

- **New suites:**
  - `lib/meme/screener`, `momentum`, `what-if`, `lib/session-cache`, and
    `lib/query-persist`.
  - `use-meme-screener`: request budget, session hydration, disabled surfaces
    and restore.
  - `meme-gamified-bits`, `meme-trending-strip`, `meme-sort-menu`,
    `meme-screener-filters` and `meme-screener-toolbar`.
- **Extended:** `lib/api/schemas/trade`, `lib/meme/parse`, `lib/meme/api`,
  `meme-desktop-board` (the slot layout, with the no-slot DOM verified
  unchanged), `meme/page` and `mobile-market-view`. No existing assertion was
  removed.
