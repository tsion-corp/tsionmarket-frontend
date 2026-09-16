# ADR-2026-09-15: a Trending strip and a market screener on the memecoin desk

## Status

Approved by the maintainer on 2026-09-15, with two amendments recorded in
this document:

1. The phone Memecoins tab gets the same feature (§1.1).
2. Trending follows the filters (§2.3). The backend code was read again for this
   and the behaviour is recorded below.

## Context

The desktop memecoin desk (`/meme`, `app/(session)/(app)/meme/page.tsx`) is a
two-column board (`features/trade/components/meme-desktop-board.tsx`): a token
list on the left with numbered pages, and the rail on the right (pair header,
chart, metrics, buy or sell ticket). The list reads the catalogue
(`GET /tokens`, 500 rows a page) through `useMemeCatalog`, filters it to the
Curated or All view on the client (`tradableHere`), and pages it ten-odd rows at
a time, loading further catalogue pages ahead (`useCatalogLookahead`).

The maintainer wants, on that desk:

1. A Trending section at the top, with pagination.
2. The main token list below it, with normal pagination.
3. Both drawn in a gamified way: each coin's gain or loss right now.
4. Filters and sorting over everything the trade service's screener offers.
5. No overfetching: responses cached and kept for the browser session in
   `sessionStorage`.
6. The layout unchanged: the rail stays on the right, every addition goes in
   the left column with the table, in the existing design system.

### What the trade service actually offers

The contract is `apps/trade/llms.txt` in `tsionark-monorepo`. It was checked
line by line against `token.controller.ts`, `token-catalog.service.ts` and
`token.repository.ts` on `origin/main`. Where the prose and the code
disagree, the code is what the app will meet, and this ADR follows the code.

**Screener parameters, on both `GET /tokens` and `GET /tokens/trending`:**

| Parameter                            | Values                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `timeframe`                          | `5m`, `1h`, `6h`, `12h`, `24h` (default `24h`)                                |
| `minMarketCapUsd`, `maxMarketCapUsd` | finite number, 0 or more                                                      |
| `minPriceUsd`, `maxPriceUsd`         | finite number, 0 or more                                                      |
| `minAgeMinutes`, `maxAgeMinutes`     | finite number, 0 or more; age of the top pair, not of the listing             |
| `minTransactions`, `maxTransactions` | per `timeframe`                                                               |
| `minVolumeUsd`, `maxVolumeUsd`       | per `timeframe`                                                               |
| `minTraders`, `maxTraders`           | per `timeframe`                                                               |
| `minLiquidityUsd`, `maxLiquidityUsd` | current value                                                                 |
| `sortBy`                             | `marketCap`, `price`, `age`, `transactions`, `volume`, `traders`, `liquidity` |
| `sortOrder`                          | `asc`, `desc` (anything that is not `asc` is `desc`)                          |

Facts from the code that shape the design:

- **No validation errors.** A bad value is dropped or defaulted, never a 400.
  The app must therefore never send a value it has not validated itself, or
  the table would silently show an unfiltered list.
- **There is no "amount" filter.** `amount` exists only in a swap request.
  The closest screener bounds are price, market cap, volume and liquidity.
- **`timeframe` and `sortOrder` alone change nothing.** The filtered path only
  runs when `sortBy` or a min/max bound is set.
- **The filtered path is expensive.** It loads every listed token, builds each
  one from three database reads, filters and sorts in memory, then slices a
  page. `limit` does not reduce that work, so a page of 10 costs the backend
  what a page of 500 does. Asking for 10 at a time would multiply the cost.
- **`GET /tokens/trending` cannot be paged.** It ignores `page` and returns up
  to `limit` items (default 100, max 500) with `total = items.length`.
- **Trending items carry `chain`; catalogue items do not.** Chain is derived
  from `chainId` (8453 Base, 101 Solana).
- **Per-timeframe activity is sparse.** Every item carries
  `activity[5m|1h|6h|12h|24h] = { volumeUsd, transactions, traders, priceChangePercent }`
  and `pairCreatedAt`. The worker's re-ingest keeps only the flat 24h columns,
  so for most tokens the 5m to 12h windows, 24h transactions and traders, and
  `pairCreatedAt` are `null`. Codex never fills 6h and DexScreener never fills
  12h. A screener bound on a null metric excludes the token.
- **Freshness.** Discovery runs every 300s and there are no response caches or
  `Cache-Control` headers upstream. Market data is at best five minutes old.
  The gateway rate-limits `/v1` at 100 requests a minute per IP, and every one
  of our users shares the Next.js server's IP. Overfetching is therefore not
  only waste: it can get the whole app rate-limited.
- **Rendering rules (llms.txt L161-L194).** `null` renders `—`, never `0`. A
  token is never hidden because of nulls. Identity is `chainId + address`, and
  Solana addresses are never lowercased. Money and percentages are decimal
  strings, and percentages are already in points (`12.5` means +12.5%).

### What the app already has

- `/api/trade/[...path]` forwards query strings untouched, validates `tokens`
  and `tokens/trending` against `tokenListSchema`, and caches unauthenticated
  `tokens*` GETs in memory for 2s.
- `tokenListItemSchema` and `toMemeToken` drop `activity` and
  `pairCreatedAt`, so the app cannot show a timeframe change today.
- Every `["meme", ...]` query is persisted to **localStorage** by the global
  persister (`lib/query-persist.ts`). There is no sessionStorage cache helper.
- Reusable pieces: `NumberedPagination`, `MemeViewSwitch` (segmented pills),
  `MemeFilterButton` (popover shell), `RiskFilter` chips, `PctChange`,
  `priceLabel`, `compactUsd`, `MemeCoin`, `FlashPrice`, `ProgressBar`,
  `FlameIcon`/`TrendIcon`, `ws-card`, the `text-up`/`text-down` tokens,
  `useFittedRowCount`, `useSectionActive`, and `motion` with `useReducedMotion`.
- `fetchTrendingTokens` and `useTrendingMemes` already exist for the phone
  board. They fall back to the catalogue on error and swallow the error
  (`catch { trending = null }`). They are left untouched; the desk does not
  use them.

## Decision

### 1. Layout: one new column wrapper on the left, rail untouched

```
┌──────────────────────── meme-board ───────────────────────────────────────┐
│ [search 394px] [Curated|All]                    (unchanged controls row)    │
│ ┌──────────── left column (new wrapper) ─────────┐ ┌──── rail 468px ─────┐ │
│ │ ┌─ Trending card ────────────────────────────┐ │ │ pair header         │ │
│ │ │ 🔥 Trending now · 24h      ‹ 1 / 6 ›       │ │ │ chart (open)        │ │
│ │ │ [#1 card] [#2 card] [#3 card] [#4 card]    │ │ │ metrics             │ │
│ │ └────────────────────────────────────────────┘ │ │ buy / sell ticket   │ │
│ │ ┌─ Screener toolbar ─────────────────────────┐ │ │                     │ │
│ │ │ [5m 1h 6h 12h 24h] [Sort ▾] [Filters ②]    │ │ │   (not modified)    │ │
│ │ │ chips: Mcap < $1M ✕   Liquidity ≥ $10K ✕    │ │ │                     │ │
│ │ └────────────────────────────────────────────┘ │ │                     │ │
│ │ ┌─ token-list panel (existing) ──────────────┐ │ │                     │ │
│ │ │ Asset │ Price │ 1h │ Mkt cap │ (sorted col)│ │ │                     │ │
│ │ │ rows … fitted to the room left              │ │ │                     │ │
│ │ │ 500 of 11,502 · ‹ 1 2 3 … ›                 │ │ │                     │ │
│ │ └────────────────────────────────────────────┘ │ └─────────────────────┘ │
│ └────────────────────────────────────────────────┘                         │
└────────────────────────────────────────────────────────────────────────────┘
```

- `desk-columns` gains one child wrapper on the left
  (`flex min-w-0 flex-1 flex-col gap-3 self-stretch`) holding the Trending
  card, the screener toolbar and the existing `token-list` panel. The rail
  section and its props are not modified.
- The 682px floor moves from `token-list` to the left column, so the desk is
  exactly as tall as it is today. The list panel becomes `flex-1 min-h-0`, and
  `useFittedRowCount` fits whole rows into what is left, as it already does for
  the stale-prices strip. At a 900px-tall window about 7 rows fit instead of 11.
  That is the trade-off for keeping the desk height fixed.
- The controls row above both columns keeps only search and the view switch,
  so nothing new competes for width over the rail.
- The board takes two new optional slots, `trending` and `screener`. When the
  page omits them, the board renders exactly as it does today, so existing
  board tests keep their meaning.

#### 1.1 Phone (amendment 1)

The phone Memecoins tab (`features/trade/components/mobile-market-view.tsx`)
gets the same three pieces inside its existing scroll box, in this order:
search, the Curated/All switch, the Trending carousel, the screener toolbar and
chips, then the list. Nothing above the scroll box and nothing in the meme
ticket changes.

- The Trending strip renders its cards in a swipeable snap row
  (`flex snap-x snap-mandatory overflow-x-auto ws-no-scrollbar`, the pattern
  `square-live-strip.tsx` uses), 212px a card, with the same compact pager
  underneath. `Carousel` was considered; it auto-advances and measures its own
  frame, which a paged list does not want.
- The toolbar's timeframe pills scroll horizontally (`ws-no-scrollbar`). Sort
  and Filters open as bottom sheets in `ModalShell` rather than popovers,
  because a popover does not fit a phone.
- The list rows keep their 60px height. The change under the price follows the
  timeframe, and the sorted metric joins the price column's second line when a
  sort is applied.
- The list still uses `PagedRows` and `MemeCatalogMore`, fed from
  `useScreenerCatalog` while the screener is active.
- Desktop and phone share one controller hook (§2.4), so the rules are written
  once. The screener's state is shared in sessionStorage, so a desktop session
  narrowed to a phone keeps its filters.

### 2. Data

#### 2.1 Domain type

`MemeToken` gains two optional fields, parsed at the boundary:

```ts
type MemeTimeframe = "5m" | "1h" | "6h" | "12h" | "24h";
interface MemeActivity {
  volumeUsd: string | null;
  transactions: number | null;
  traders: number | null;
  priceChangePercent: string | null;
}
interface MemeToken {
  // …existing fields unchanged
  activity?: Partial<Record<MemeTimeframe, MemeActivity>>;
  pairCreatedAt?: string | null;
}
```

`tokenListItemSchema` gains the same two fields as `.optional()`, so search
results, which lack them, still parse. `toMemeToken` copies them. Adding
optional fields leaves every persisted catalogue entry valid, so
`RQ_PERSIST_BUSTER` is not bumped. A timeframe change is read from
`activity[tf].priceChangePercent`. For `24h` only, a missing value falls back to
`priceChange24hPercent`, the same measurement. No window is ever estimated
from another.

#### 2.2 Screener model (`lib/meme/screener.ts`, pure)

- `ScreenerFilters`: timeframe, sort (`sortBy` plus `sortOrder`), and seven
  optional `{ min?: string; max?: string }` bounds, held as decimal strings.
- `validateBounds(filters)`: each bound must be a non-negative decimal, and
  min ≤ max, compared as decimals, not floats. It returns per-field errors, and
  an invalid draft cannot be applied.
- `screenerActive(filters)`: true when `sortBy` or any bound is set. The same
  rule the backend uses.
- `screenerQuery(filters)`: builds the canonical query string with keys sorted,
  empty values omitted, and canonical parameter names only (never the aliases).
  `timeframe` is sent only when a timeframe-scoped bound (transactions,
  volume, traders) or sort is applied, because it changes nothing else.
  Switching the window for display then never refetches. The string is both the
  request and the cache key, so equal filters share one cache entry whatever
  order they were set in.
- `SCREENER_PRESETS`: one-tap presets for the gamified bar. Each is plain
  bounds and a sort, with no hidden logic: **Fresh launches** (age ≤ 60 min,
  newest first), **Big movers** (sort by volume, desc), **Micro caps**
  (market cap ≤ $1M), **Deep liquidity** (liquidity ≥ $100K), **Crowd
  favourites** (sort by traders, desc).

#### 2.3 Fetching (`lib/meme/api.ts`, new functions only)

- `fetchScreenerPage(page, filters)`:
  `GET /tokens?page=N&limit=500&<screenerQuery>`, parsed with the existing
  `parseTokenPage`. It asks for 500 because the backend's filtered cost does
  not depend on `limit`. One request covers what 50 small pages would.
- `fetchTrendingBoard(filters, limit = 100)`:
  `GET /tokens/trending?limit=100&<trendingQuery>`, parsed with
  `parseTokenPage`. It has no catalogue fallback and no swallowed error. A
  failure reaches the hook as an error and the card shows its retry state.

**Trending follows the filters (amendment 2).** `TokenCatalogService.trending`
on `origin/main` works like this:

1. Without filters, it takes the `limit` most recently updated tokens.
2. With a bound or a `sortBy`, it takes every listed token instead.
3. In both cases it ranks tradable coins first, then by 24h volume.
4. It applies `filterAndSort`. The bounds filter and keep that ranking; a
   `sortBy` replaces the ranking.
5. It slices to `limit`.

So Trending is sent the table's **bounds and timeframe but never its sort**
(`trendingQuery(filters)` is `screenerQuery` without `sortBy`/`sortOrder`).
It stays "the hottest coins that match your filters", ranked by activity, and a
sort only reorders the table. A sort-only screener leaves Trending unfiltered,
with no extra request. The strip's subtitle says "Matching your filters" while
bounds apply.

#### 2.4 Hooks (`features/trade/hooks/use-meme-screener.ts`)

| Hook                               | Query key                                     | staleTime | Refetch                                                                                     |
| ---------------------------------- | --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `useTrendingBoard(filters,view)`   | `["meme-screener","trending", trendingQuery]` | 60s       | every 120s, only while the tab is visible and the section is on screen (`useSectionActive`) |
| `useScreenerCatalog(filters,view)` | `["meme-screener","list", query]`             | 60s       | none on a timer; `enabled` only while `screenerActive`                                      |

- The key prefix `meme-screener` is deliberately not in `PERSISTED_PREFIXES`.
  The new data lives in sessionStorage, as asked, and not in the existing
  localStorage snapshot. The catalogue's existing persistence is unchanged.
- The view (Curated or All) is applied on the client with the existing
  `tradableHere` and is not part of the key. Switching views never refetches.
- `useScreenerCatalog` returns the same shape as `useMemeCatalog` (`tokens`,
  `total`, `loaded`, `shownCount`, `hasMore`, `loadMore`, …). The page can then
  hand either one to the existing `useCatalogLookahead`, `NumberedPagination`
  and `MemeCatalogMore` without new paging code.
- While the screener is inactive, the table uses `useMemeCatalog` exactly as
  today and `useScreenerCatalog` makes no request.
- `useMemeScreener({ view, query })` is the controller both surfaces call:
  draft and applied filters, the sessionStorage mirror, the trending page, and
  which list source is live (search, screener or catalogue). The page and the
  phone tab only render what it returns.

#### 2.5 Session cache (`lib/session-cache.ts`)

A small, framework-free store over `sessionStorage`:

- Entries are `{ v: SCHEMA_VERSION, savedAt, data }` under
  `wsws.meme-screener.<key>`. At most 12 entries are kept, and the oldest
  `savedAt` is evicted first.
- `read(key, maxAgeMs)` returns `null` for a missing, expired, wrong-version or
  unparsable entry, and deletes the bad one.
- `write(key, data)`: on a quota error it evicts the oldest entry and retries
  once. If that also fails it reports through `console.warn` with the key and
  the error, and the app carries on with the in-memory cache. Nothing is
  swallowed silently. A missing `sessionStorage` (private mode, SSR) is
  detected up front and is not treated as an error.
- Only the parsed `MemeToken` pages are stored, not the raw response.

The hooks use it through TanStack Query's `initialData` and
`initialDataUpdatedAt`: a cached entry younger than 5 minutes paints at once. It
counts as fresh for 60s, and after that one background refetch replaces it and
writes the new result back. Within one tab, returning to a filter combination
already seen costs no request until it is a minute old. Reloading the tab
keeps the cache; closing the tab discards it.

Request budget, compared with a naive design, for one user in one minute:

| Action                         | Naive                   | This design                                                                       |
| ------------------------------ | ----------------------- | --------------------------------------------------------------------------------- |
| Open the desk                  | trending + catalogue    | trending + catalogue (same as today)                                              |
| Type a bound                   | a request per keystroke | 0 (draft only; applied with **Apply**)                                            |
| Page 1 → 20 of a filtered list | 20 requests of 10 rows  | 0 or 1 (500 rows cover about 50 pages)                                            |
| Switch 24h → 1h and back       | 2 requests              | 0 unless a bound or sort depends on the timeframe; then 1 the first time, 0 after |
| Apply a set of bounds          | 2                       | 2 (table + trending), then cached for the session                                 |
| Reapply a preset used earlier  | 1                       | 0 within 60s, 1 background refresh after                                          |
| Trending while idle            | 30s polling             | 1 every 120s, paused off screen or in a hidden tab                                |

### 3. Gamified presentation, within the existing design system

No new colours, fonts, radii or keyframes. Gains use `text-up`/`bg-up`,
losses `text-down`/`bg-down`, and cards `ws-card`. Rank rings copy the silver
leaderboard ring from `winners-list.tsx`. Motion uses `motion`, and every
animation has a `useReducedMotion` or `motion-safe:` fallback.

**Trending card** (`meme-trending-strip.tsx`), four cards a page on desktop:

- A rank ring (`#1` to `#3` with the stronger silver ring, as the leaderboard
  does), logo, symbol.
- The change for the selected timeframe in the display face, with the
  `PctChange` colour and sign, `—` when null.
- A **what-if line**: "$100 → $112.34", what $100 bought one timeframe ago
  would be worth now, computed in `lib/meme/what-if.ts` with bigint fixed-point
  arithmetic on the decimal strings, never floats. It is hidden, not shown as
  $100, when the change is null.
- A **momentum tag** from the change, in words: 🚀 Mooning (≥ +50%), 🔥 Pumping
  (≥ +10%), 🧊 Cooling (≤ −10%), 🩸 Dumping (≤ −30%), nothing in between. Pills
  use the `RiskBadge` shape.
- A **heat bar** (`ProgressBar`): the coin's volume in the selected timeframe
  relative to the busiest coin on the page, with the ratio computed in bigint.
  It is empty with a "no data" label when the volume is null.
- `FlashPrice` flashes the price when a refetch changes it. Cards enter with the
  leaderboard stagger (0.04s, capped at 0.3s).
- A compact pager in the card header ("‹ 1 / 6 ›", with its own aria labels
  such as "Previous trending page"), so it can never be confused with the
  table's `NumberedPagination`. Clicking a card selects that coin into the rail,
  as a table row does.
- Loading shows four card skeletons. An error shows the meme retry pill inside
  the card. Empty shows "Nothing trending in this view yet".

**Screener toolbar** (`meme-screener-toolbar.tsx`):

- Timeframe pills styled as `MemeViewSwitch`.
- **Sort**: a popover list (`MemeFilterButton` panel classes) of the seven sort
  keys, each with a direction toggle. The active sort shows on the button.
- **Filters**: the `MemeFilterButton` popover with presets as `RiskFilter`-style
  chips at the top, then seven min/max decimal inputs (`ws-invalid` on an
  invalid field), **Reset** and **Apply**. The count badge shows applied bounds.
- **Active chips** under the toolbar, one per applied bound or sort, each with a
  clear (✕), plus "Clear all".
- A hint appears when a timeframe-scoped bound is applied: "Some coins don't
  have 5m data yet, so they're left out of this filter". This is llms.txt's
  "missing metrics do not match a bound", said to the trader.

**Table** (the existing panel; the row height stays 57px):

- The `24h` column follows the timeframe: its header reads the selected window,
  and a 2px momentum bar under the percentage fills with the move, capped at
  ±100%.
- When a sort is applied on a metric not already shown (volume, transactions,
  traders, liquidity, age), a fifth 96px column shows that metric, so the
  trader sees why the order is what it is. The existing four columns are not
  changed.
- A 🔥 marker next to the symbol on the top three gainers of the current page.

### 4. State and persistence of the controls

Applied filters, timeframe, sort and the trending page live in page state. They
are mirrored to sessionStorage (`wsws.meme-screener.ui`) and restored on mount
after hydration, as `spot-mode.tsx` does, so a reload does not reset the
screener. Changing any applied filter returns the table to page 1, the same
rule the view and search already follow.

Search keeps its current behaviour and takes priority over the screener: while
a query is typed, the table shows search results and the toolbar shows that
filters are paused.

### 5. Strings

A new `memeScreener` namespace covers timeframe labels, sort keys, filter
labels, presets, momentum tags, the what-if line, hints and pager labels, in
all five catalogues (`en`, `de`, `es`, `fr`, `pt`). Existing `meme.*` keys are
reused where they already mean the same thing (`trendingTitle`, `filters`,
`retry`). No existing key changes.

## What is not changed

- The rail, the ticket, the chart and the metrics, and every prop they take.
- `useMemeCatalog`, `useMemeSearch`, `useMemeToken`, `useTrendingMemes`,
  `fetchTrendingTokens`, `useCatalogLookahead` and the proxy route.
- The phone Memecoins tab's search, ticket, risk consent and scroll restore.
  Only its list area gains the new pieces.
- The dashboard's meme board and grid (`meme-board.tsx`, `meme-grid.tsx`).
- The global persister, `PERSISTED_PREFIXES` and `RQ_PERSIST_BUSTER`.

## Consequences

**Positive**

- All seven screener metrics, both sort directions and all five windows are
  reachable. The table shows why it is in the order it is.
- A filtered session costs about one request per distinct filter combination
  per minute, which keeps the shared gateway limit safe.
- Paging, Curated/All and lookahead reuse the machinery already proven on the
  desk.

**Negative and risks**

- Fewer table rows fit, about 7 instead of 11 at 900px, because the height is
  shared with Trending and the toolbar.
- Per-timeframe data is sparse because of the backend re-ingest issue below.
  Until the backend fixes it, most coins show `—` for 5m to 12h and are left out
  of transaction, trader and age filters. The hint and the `—` make this honest;
  they cannot make it full.
- Applying bounds costs two filtered requests (table and trending). Each
  is a full catalogue scan on the backend, cached afterwards.
- A filtered request is a full catalogue scan on the backend and could reach
  the gateway's 10s timeout as the catalogue grows. The table then shows its
  existing error and retry state.
- A 500-row page is about 200 KB parsed, so sessionStorage holds about 12
  entries before evicting. That is enough for a session's worth of combinations.

## Backend issues to report (not fixed here)

1. `ingest()` and Solana `market()` save only the flat columns, dropping
   `activity` and `pairCreatedAt` on every refresh
   (`token-catalog.service.ts:403-412`).
2. Unfiltered `/tokens` pages order by `updatedAt` with no unique tiebreaker,
   so rows can repeat or be skipped between pages.
3. Unfiltered trending takes the most recently updated tokens, not the top by
   24h volume as llms.txt L97 says.
4. `chart` keeps the first 120 points, not the latest
   (`token.repository.ts:325-331`).
5. llms.txt L91 says `GET /tokens` triggers discovery; the controller does not.
6. The screener accepts invalid values silently instead of returning 400.

## Alternatives considered

- **Server pages of 10 per table page.** Rejected: the same backend cost per
  request, ten times the requests, and no reuse of the lookahead paging.
- **Filter the loaded catalogue on the client.** Rejected: the catalogue holds
  500 rows at a time out of about 11,500, so client filters would be wrong, and
  it cannot sort the whole universe.
- **Send the table's sort to Trending as well.** Rejected: with `sortBy` the
  backend no longer ranks by activity, so Trending would stop being trending.
  (Filtering Trending by the bounds was adopted, amendment 2.) It also would double
  the full-scan cost. It can be added later as a toggle.
- **Add `meme-screener` to the localStorage persister.** Rejected: the
  maintainer asked for session-scoped storage, and 500-row filtered pages
  across many combinations would crowd the 24h localStorage snapshot that the
  whole app shares.
- **Put the Trending strip above both columns.** Rejected: it would push the
  rail down, which the maintainer ruled out.

## Test plan

- `lib/meme/screener.test.ts`: validation (negative, non-decimal, min > max,
  huge decimals), canonical query order, aliases never emitted, timeframe
  omitted when inactive, presets.
- `lib/meme/what-if.test.ts`: exact bigint results for gains, losses, −100%,
  float-artifact inputs such as `"12.340000000000002"`, and null.
- `lib/session-cache.test.ts`: expiry, version mismatch, corrupt JSON,
  eviction order, quota retry, the warn path, no storage.
- `lib/meme/parse.test.ts` and `lib/api/schemas/trade` tests: `activity` and
  `pairCreatedAt` parsed, absent on search, and Solana address case kept.
- `use-meme-screener.test.tsx`: one request per distinct query, no request while
  inactive, sessionStorage hydration without a refetch inside 60s, a view
  switch that does not refetch, a paused trending refetch off screen, and
  errors surfaced.
- Component tests for the strip, toolbar and board slots: null renders `—`,
  the pager labels, Apply disabled while invalid, chips clearing, an empty
  heat bar, the reduced-motion path, and cards selecting into the rail.
- `meme/page.test.tsx`: search overrides the screener, the page resets on
  apply, the table switches data source when the screener becomes active, and
  every existing assertion still passes, with the mocks extended.
- `lib/i18n-catalogs.test.ts` stays green with the new namespace in all five
  catalogues.
- `./scripts/preflight.sh` clean, then a manual pass on the dev server.
