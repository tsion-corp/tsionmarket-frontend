---
title: The memecoin catalogue pages past 500 rows, behind a Curated / All switch
date: 2026-09-14
area: memecoins
adr: ADR-2026-09-14-memecoins-trade-contract
scenario-impact: updated
---

# Release Note: catalogue paging and the discovery policy (slice 4 of the trade contract)

The fourth of five slices bringing the memecoins feature onto the trade
service's frontend contract (`trade-llms.txt`). The app used to read one page
of 500 and call it the whole catalogue; the live total on 2026-09-14 was
105,959 rows (14,343 on Base). This slice reads the catalogue the way the
contract says to, and writes the discovery filters down as an explicit policy
with two views the reader can switch between.

## What changed

- **Paging.** `useMemeCatalog` is an infinite query over
  `/tokens?page=n&limit=500[&chain=]`. Page 1 loads on mount; each further
  page loads only on "Load more", and the next page exists only while
  `page * limit < total` (`nextCatalogPage`). `limit` is never above 500
  (`CATALOG_PAGE_LIMIT`; `fetchTokenCatalog` clamps too). Pages are merged
  without repeats, by `chainId:address` (EVM case-insensitive, Solana as
  written).
- **Counts are the server's.** `tradableHere` no longer overwrites
  `meta.total`; the filtered size is a separate `shownCount`. The desk, the
  grid and the phone tab show "500 of 11,502" (rows loaded against the
  server's total) and "156 shown" (what the view kept), with "Load more" until
  the pages cover the total. A failed "Load more" says so and keeps the rows
  already loaded. Both step aside while a search is showing.
- **`DISCOVERY_POLICY` in `lib/meme/catalog.ts`, two named views.**
  - `curated` (default, what staging showed before): LOW/MEDIUM risk,
    `buyEnabled`, liquidity at least $10k where known, 24h volume at least
    $100 where known, DEGEN hidden.
  - `all` (the contract's view): every row on a supported chain. A
    `LOW_LIQUIDITY` row is listed with its badge and asks for consent before
    any quote (slice 3).
  - Both: status must be ACTIVE (a row with no status, as trending and search
    send, passes); the quote currency, wrapped majors, coins impersonating a
    major and tokenized equities stay out. A null liquidity or volume never
    excludes a row.
- **The switch.** "Curated / All" on the desktop desk (beside the search), the
  grid (beside the filters) and the phone Market page's Memecoins tab (under
  its search). Switching re-filters the pages already loaded and the search
  results already fetched; it asks the service for nothing. The dashboard
  brief (`lib/server/dashboard-feed.ts`) and the "Find the next 100X" card
  (trending) stay curated.
- **The phone Memecoins tab lists the catalogue**, not trending: the same
  pages, switch, count and "Load more" as the desk. Its search field searches
  the service ("Search all memecoins") instead of filtering loaded rows, and
  its ticket is held by `chainId:address`.
- **Solana behind a flag.** Solana rows are admitted to both views, and to
  search and trending, only when `NEXT_PUBLIC_MEME_SOLANA_DISCOVERY=1`
  (documented in `.env.example`; off by default, inlined at build). Solana
  trading code is unchanged.
- **Holdings allowlist.** `lib/server/buyable-registry.ts` walks Base catalogue
  pages of 500 until the total, bounded at 20 pages and revalidated every ten
  minutes, instead of reading page 1 of 100. A failed page keeps the pages
  already read and is logged. A stopgap until slice 5 moves held memecoins to
  the service's `/portfolio`.
- **Identity in keys.** `memecoins-view.tsx` and `meme-pro-view.tsx` key rows
  by `chainId:address`, not address alone.

## Deviations and limits

- DEGEN is hidden in `curated` only. The ADR's `all` view lists every ACTIVE
  row and names only the quote currency, wrapped majors, impersonators and
  equities as exclusions, so DEGEN appears under All.
- The registry's 20-page bound covers 10,000 of Base's 14,343 rows today; a
  coin held past that is still missed on the Alchemy path until slice 5.
- `MemeBoard` (`meme-board.tsx`) is not mounted by any route. It reads the
  curated first page for its default coin; its picker is `MemeGrid`, which
  has the switch.

## Backend still needed

- An ops funding SLA for the Solana gas sponsor wallet before
  `NEXT_PUBLIC_MEME_SOLANA_DISCOVERY` is switched on.
- Whether `/tokens/trending` honours `?chain=` (the app still assumes not).
- A server-side discovery view, so the policy can leave the client.

## Scenario impact

`updated`: the meme desk, grid and phone tab now have a Curated / All switch,
a server-total count and "Load more"; the phone tab lists the catalogue rather
than trending.
