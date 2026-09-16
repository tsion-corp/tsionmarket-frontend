---
date: 2026-09-16
feature: The memecoin desk table sorts from its headings
scope: trade
scenario-impact: none
---

# The memecoin desk table sorts from its headings

The desk's token list now runs on `@tanstack/react-table`, the library the
portfolio and spot tables already use, and its column headings sort.

## What a trader sees

Click **Price**, **Mkt cap** or the sorted-metric column to sort by it. A fresh
column opens descending, because the first question asked of a screener is
which is the biggest. Clicking again flips it; a third click clears the sort, so
a heading can always be undone. An arrow marks the sorted column and
`aria-sort` announces it.

Asset and the change column stay plain text: neither has a screener bound
behind it, and a heading that looks pressable and does nothing is worse than one
that plainly is not.

Nothing else moves. Same columns, same 57px rows, same colours.

## One sort, not two

The sort is the screener's, not the table's. A heading click calls the same
`setSort` the sort menu calls, so the two can never disagree, and whichever is
used is also what reaches the backend as `sortBy`/`sortOrder` and what is kept
in the session cache.

`manualSorting: true`. The rows arriving at the table are already ordered by
`applyScreener`, which compares exact decimal strings and puts unreadable values
last in both directions. TanStack's own comparators would read `"3491589227"`
against `"25564"` as text, or push both through `Number` — the class of bug the
screener was written to avoid. The table renders the order; it does not compute
it.

## What did not happen

**No second search box.** The plan was a global filter over the loaded rows,
until the panel turned out to already have a search that queries the whole
catalogue through the backend. Searching the rows in hand would have been a
weaker duplicate sitting two centimetres from the better one, so it was dropped
along with its helper and its strings.

**No `<table>` markup.** The rows are a grid of buttons in an absolutely
positioned layer so they contribute nothing to the panel's height, which is what
lets the row count be measured and the panel end on a row boundary. Semantic
table markup would hand that back to the browser for no gain: this list is a
picker, not a spreadsheet.

**The phone is untouched.** `mobile-market-view.tsx` is not in the diff. The
phone tab is a list of cards, which is the right shape for a narrow screen and
wants no column model.

## How it was verified

`meme-table-columns.ts` holds the column list and the click, aria and
extra-column rules as pure functions, with 10 tests: the descending-first rule,
the flip, the third click clearing rather than cycling, a non-sortable column
leaving the sort alone, and `aria-sort` absent rather than `"none"` on a column
that cannot sort.

Five component tests cover the wiring, including that the board draws plain
headings when given no setter, which is how a read-only caller gets it.

The header row gained `data-region="token-header"`. Two existing tests found it
as the panel's first child, which was fragile: it broke the moment anything was
added above it.

`/meme` is 1606 kB against its 1660 budget, up 14 kB, and the budget is not
raised. Full `./scripts/preflight.sh` clean: 5,099 tests.

## Noted

React Compiler skips this component now — "Use of incompatible library" — as it
already does for `portfolio-view.tsx` and `spot-simple-view.tsx`, the two other
tables on this library. An accepted trade-off here rather than a new one.
