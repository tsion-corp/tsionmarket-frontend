# ADR-2026-09-07: Memecoins as a board of cards, not a simple/pro switch

## Status

Accepted — 2026-09-07. The maintainer asked for the parked board to be
brought back and used, with the code implemented first and every failure
handled; this record documents that decision.

## Context

`/meme` renders `MemeSection`: an eyebrow, a simple/pro switch persisted in
localStorage, and one of two views. Simple is a paged grid of eight trending
cards. Pro is a search box, a server-paged table of ten rows, a chart drawn
from CoinGecko, and a trade card. Both open `MemeTradeSheet`.

Three problems, all visible in the screenshot that prompted this:

1. **Two interfaces, one job.** The switch exists because spot and perps have
   one. On memecoins the "pro" desk adds a chart the trade service cannot
   feed for most coins (`noChart` is its usual state) and a table whose seven
   columns weigh the symbol the same as the DEX name. Nobody picks a memecoin
   by DEX name.
2. **Ten rows a page, paged on the server.** The boundary filter that drops
   the quote currency and the wrapped majors runs after the server cuts the
   page, so a page holding cbBTC comes back short. Risk bands were never
   offered, and search hit the provider on every keystroke pair.
3. **Two chains in one list, unlabelled.** With ADR-2026-09-06 the catalog
   carries Base and Solana rows together. A coin called the same thing on
   both chains is a different coin on each, and the card gave no way to tell.

A rebuild was designed and parked in a stash on 2026-09-02 (`feat/memecoin-page-shell`),
before the chain work and before the v1.4 route groups. It is the basis here.

## Decision

Replace the section and both views with one board:

```
app/(session)/(app)/meme/page.tsx
  └─ MemeBoard                         features/trade/components/meme-board.tsx
       ├─ Eyebrow
       ├─ MemeTrending  onOpen ─┐      trending shortlist, 5 a page
       │    ├─ MemeSearchInput  │      catalogue search, debounced
       │    ├─ RiskFilter       │      chips with counts, all five bands
       │    └─ MemeUnavailable  │      failure state with retry
       ├─ MemeGrid      onOpen ─┤      whole catalogue as cards, 21 a page
       │    ├─ MemeSearchInput  │
       │    ├─ MemeChainFilter  │      All chains | Base | Solana → ?chain=
       │    ├─ MemeFilterButton │      risk bands behind a button + count
       │    └─ MemeUnavailable  │
       └─ MemeTradeSheet ◄──────┘      unchanged; opened with the row in hand
```

- **One list model.** Each list holds `source` (trending, catalogue, or
  search results when a search is active), narrows it by risk band on the
  client, and pages it on the client. Counts on the chips are taken before
  filtering so a chip says what it would bring back.
- **The catalogue is one request.** `fetchTokenCatalog(1, 500, chain?)`,
  500 being the service's per-page cap and the catalogue being ~405 rows.
  Filter first, cut after: a page is always full.
- **Chain is visible and selectable.** `ChainTag` on every card, from
  `chainSlug(chainId)`. `MemeChainFilter` asks the catalogue for one chain
  with `?chain=`, the only discovery route that honours it.
- **Wrapped majors are dropped at the boundary.** `isWrappedMajor` joins
  `isQuoteCurrency` in `tradableHere`/`isMemecoinHere`; cbBTC on Base is the
  first entry. This is a stopgap the service should own; the comment says so.
- **Every failure has a state.** Catalogue down, trending down, search
  failed: `MemeUnavailable` in place of the rows, with a retry that refetches
  or, for search, clears the query. A failed search is no longer reported as
  "nothing matched". `useMemeCatalog` and `useMemeSearch` expose `error`.
- **Picking a coin opens the sheet with the row.** The sheet already reads
  fresh detail in the background and falls back to the row when the detail
  route fails, which it does today for Solana mints outside the persisted
  catalogue (`PROVIDER_ERROR`).

Deleted: `meme-section.tsx`, `meme-mode.ts`, `meme-simple-view.tsx`,
`meme-pro-view.tsx`, and `interface-mode.tsx`, which only the meme switch
used. Spot and perps keep their own mode stores.

Not taken from the stash: the dashboard `MemePreview` and the `app/meme`
route with its own shell. `main` already shows memecoins on the dashboard
through the feed-driven `MemeOverview`, and the `(app)` group provides the
shell.

## Consequences

- The pro chart is gone from memecoins. It drew from CoinGecko by id and had
  nothing for most coins. `AssetChart` stays for spot.
- The persisted `wsws.meme-mode.v1` key is orphaned in users' localStorage.
  It is never read again and is harmless.
- One request of up to 500 rows replaces many of ten. Measured on the dev
  proxy: 1.5–2.3 s warm, ~7 s cold. The skeleton covers it; a chain lane is
  ~1.3 s.
- The trade service's search returned an empty array for every query on
  2026-09-07, including a mint it matched the day before. The board shows
  "nothing matched" for an empty 200 and the unavailable state for a failed
  request; it cannot tell a silent upstream from a true miss.

## Tests

Red first, then green: `lib/meme/catalog.test.ts` (wrapped majors),
`lib/meme/api.chain.test.ts` (chain-scoped catalogue), `meme-grid.test.tsx`
(cards, panel, risk bands, search replaces page, full pages, chain tag,
chain lane, catalogue down with retry, search failed), `meme-trending.test.tsx`,
`meme-open-trade.test.tsx`. Locale keys added to all five catalogs.
