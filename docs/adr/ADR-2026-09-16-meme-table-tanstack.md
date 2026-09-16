# ADR-2026-09-16 — The memecoin desk table on TanStack Table

- **Status:** approved by the maintainer on 2026-09-16, in conversation
- **Branch:** `feat/meme-screener-tanstack`, cut from `origin/staging`
- **Companion:** [ADR-2026-09-16-meme-table-tanstack-for-dummies.md](./ADR-2026-09-16-meme-table-tanstack-for-dummies.md)
- **Builds on:** [ADR-2026-09-15-meme-trending-screener.md](./ADR-2026-09-15-meme-trending-screener.md)

## Context

The desk's token list (`features/trade/components/meme-desktop-board.tsx`) is a
CSS grid of `<button>` rows with a measured row count: the rows sit in an
absolutely positioned layer so they cannot prop the panel open, and the list is
cut to the number that fit. That mechanism is load-bearing and hard-won; the
file documents at length why nothing weaker holds.

Its columns are fixed spans of header text. They are not clickable, so sorting
happens only through the `MemeSortMenu` popover, and there is no way to search
the rows on screen. The maintainer asked for the column behaviour a trader
expects from a screener — click a heading to sort, type to find a coin.

`@tanstack/react-table@8` is already a dependency and already used by
`features/portfolio/components/portfolio-view.tsx` and
`features/trade/components/spot-simple-view.tsx`, so this adopts an existing
pattern rather than introducing one.

## Decision

### 1. Headless only. The DOM does not change.

TanStack Table is a row-model library, not a renderer. It supplies
`getRowModel()`, sorting and filtering state; we keep the existing grid of
buttons, the `COLUMNS` template, the measured `fittedRows` slice and every
class.

Nothing is converted to `<table>`. That markup would give the browser back
control of row height and break the measurement the panel depends on, for no
gain: this list is a picker, not a spreadsheet.

### 2. One source of truth for the sort, and it stays the screener's

The sort is not ours to own. `ScreenerFilters.sort` is sent to the backend as
`sortBy`/`sortOrder`, drives `applyScreener`'s client-side pass, is persisted in
the session cache, and is displayed by `MemeSortMenu`.

So TanStack's `sorting` state is **derived** from `filters.sort` and never held
independently: `state.sorting` is computed from it, and `onSortingChange` calls
the screener's existing `setSort`. A header click and a menu choice are the same
action reaching the same state.

`manualSorting: true`. The rows arriving at the table are already ordered by
`applyScreener`, which compares exact decimal strings and puts unreadable values
last in both directions. TanStack's own comparators would sort
`"3491589227"` against `"25564"` as strings or coerce them through `Number`,
which is precisely the class of bug the screener was written to avoid. The table
renders the order; it does not compute it.

### 3. Search is the one thing TanStack computes

A global filter over the loaded rows, matching symbol and name, case-insensitive.
This is new capability rather than a re-implementation, and it is safe for
TanStack to own because it compares text, not money.

It filters **what is loaded**, not the catalogue, and says so: the count under
the box reads "12 of 140 loaded". A search is not a substitute for a bound,
which is what reaches the backend.

`manualFiltering` stays false for this one filter, and the screener's own bounds
are applied before the table ever sees a row.

### 4. Column definitions carry what the header needs

One `ColumnDef` per visible column, holding its heading key, its alignment and
whether it can sort. The optional metric column (the extra column the screener
shows for a sort metric) is appended when present, as today.

A column that cannot sort renders a plain `<span>`, exactly as now. A sortable
one renders a `<button>` with `aria-sort` on the header cell, so the sort is
announced rather than only drawn.

## Consequences

**Good.** Headers sort on click, which is what the request was. A search box
over the loaded rows. Column layout is described once in a definition rather
than spread across a header row and a row body that must be kept in step by
hand. The pattern matches the two tables already using this library.

**Costs.** A second way to express the same sort, which is why decision 2 is
strict about deriving rather than duplicating. Anyone adding a column now edits
a definition rather than two JSX blocks, which is the point, but it is a new
place to look.

**Bundle.** `@tanstack/react-table` is already in the dependency graph and
already loaded on `/spot` and `/portfolio`. `/meme` sits at 1592 kB against a
1660 kB budget; the measurement is in the release note, and the budget is not
raised.

**Not changed: the phone.** `mobile-market-view.tsx` is untouched. The phone
tab is a list of cards, not a table, and nothing about it wants a column model.
The maintainer asked explicitly that it be retained, and it is byte-identical.

## Alternatives rejected

- **Let TanStack sort.** It would hold a second copy of the sort that the
  backend query and the session cache know nothing about, and its comparators do
  not read decimal strings exactly.
- **Convert to `<table>` markup.** Gives up the measured row fit that keeps the
  panel from growing with its content, which the existing file argues for in
  detail.
- **Use TanStack's column filters for the bounds.** The bounds are exact-decimal
  comparisons with deliberate null handling, already pure and tested in
  `lib/meme/screener`. Re-expressing them as column filters would duplicate that
  logic in a place with different null semantics.
