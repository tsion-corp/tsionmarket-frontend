---
date: 2026-09-15
feature: Numbered pages on the memecoin desk, no Load more
scope: memecoins
scenario-impact: updated
---

# Numbered pages on the memecoin desk, no Load more

## What changed

The memecoin desk's list (the `/meme` route, desktop) pages with numbered page
buttons instead of "Page 2 of 3" beside a "Load more" button.

- **The bar** reads `‹ Prev  1 2 3 4 5 6 …  Next ›`. Any number jumps straight
  to that page; the page showing is filled white. On a long run the numbers
  collapse to the ends and the current page's neighbours, for example
  `1 … 19 20 21 … 40`. The trailing `…` means the catalogue holds more than has
  loaded.
- **No Load more.** The route fetches the next server page of 500 in the
  background while the reader is within five list pages of the end of what has
  loaded (`useCatalogLookahead`). Next on the last loaded page asks for the next
  server page outright, and the bar holds Next with a spinner until its rows
  arrive.
- **The count strip** keeps "1,000 of 115,802 · 50 shown". It says "Loading
  more…" while a page is on its way, and offers "Try again" when one failed,
  since a failed page is never retried on its own.
- **A search** is its own complete list, so the catalogue is left alone while
  one is showing.

## Why

The desk showed three pages of Curated coins and then stopped at a button, which
hid that the catalogue runs to thousands. Numbered pages show how far the list
goes, and loading ahead removes the button.

## The guard against walking the catalogue

Curated keeps a few percent of each server page of 500, and deep in the
catalogue it can keep none. A lookahead that is never satisfied would otherwise
fetch every page there is. The hook stops after 1,000 server rows (two pages)
that added no row the view shows, and resumes when the reader presses Next on the
last page or retries. A page that brings shown rows starts a fresh budget.

## Not changed

The phone Memecoins tab and the memecoin grid keep their count strip and "Load
more" (`MemeCatalogMore` without `autoLoads`). `ListPagination` is unchanged; the
new `NumberedPagination` uses its Prev and Next buttons, so the bar keeps the
height the desk's row fitting measures.

## New strings

`common.pageNumber` ("Page {page}") and `common.morePages` ("More pages"), in
all five catalogues.

## Scenario impact

A scenario that clicks "Load more" on the memecoin desk no longer finds it:
pages load ahead on their own, and paging is by number or Next.

## Tests

- `components/ui/numbered-pagination.test.tsx`: the page window at the start,
  middle and end; jumping to a page; Prev and Next at both ends; Next open past
  the last loaded page while more exist, and held while its rows load.
- `features/trade/hooks/use-catalog-lookahead.test.tsx`: fetches only while
  fewer than five pages are ahead; never while loading, failed, complete or
  searching; stops after two barren server pages; resumes on request and on a
  productive page.
- `meme-catalog-controls.test.tsx`: with `autoLoads`, no Load more, a loading
  status, and a retry on failure.
- `meme-desktop-board.test.tsx`: numbered buttons, Next past the last loaded
  page, Next held while loading.
- `app/(session)/(app)/meme/page.test.tsx`: the route loads ahead with no Load
  more, numbers its pages, asks for more on Next at the end, and leaves the
  catalogue alone during a search. Replaces the two Load more tests.
