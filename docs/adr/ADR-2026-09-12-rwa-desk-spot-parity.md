# ADR-2026-09-12: the Real assets desk takes the Spot desk's shape

## Status

Accepted, 2026-09-12, by the maintainer.

Approved with three points confirmed as written: drop the category tabs and the
column sorting, and carry liquidity as the fourth column rather than market cap.

## Context

Spot and Real assets are two of the app's six market segments. The PRD asks
every segment to follow the same four-pillar template, so a reader who learns
one desk knows the next. Today they look nothing alike.

The Spot desk (`/spot`) is the 2.0 shape: one search field over two panels, the
market list on the left in a card that reaches the bottom of the window, and
the order ticket on the right carrying the token pill, the 24h move, a chart
behind a disclosure, a Buy/Sell switch, the amount field, the share shortcuts,
the summary card and one full-width action. On a phone the same surface is the
Market page's Spot tab: the list fills the screen, and tapping a row swaps the
list for the ticket in place.

The Real assets desk (`/rwa`) is the older shape: an eyebrow heading, a row of
category tabs, a search box floated to the right, and a six-row table whose
last column is a Buy button. Nothing is selected, nothing is priced in place.
A trade takes two modal steps: tap a row to open the detail sheet, then press
Buy or Sell in the sheet to swap that same modal to the trade panel. On a
phone the Real assets tab is a plain list whose rows open the same two modals.

The request is that Real assets match Spot exactly: layout, ticket structure,
table, table height, and the phone view, with the old UI removed. Only the
content differs.

Three facts from the codebase constrain how that can be built.

**The feature boundary is mechanically enforced.** `eslint.config.mjs` lines
42 to 62 configure `eslint-plugin-boundaries` at severity `error` with the
message "A feature may not import another feature. Use its index." It runs in
`lint-staged` on commit, in `preflight.sh --fast` on push, and in the `quality`
CI job. All 1558 `@/features/` references inside `features/` resolve to their
own slice today, so the repo has no precedent to follow. `features/rwa` cannot
import `features/trade/components/spot-*.tsx`.

**The Spot blocks are generic in logic and specific in copy.** Eight of the
nine hardcode a message namespace: `spot-asset-table.tsx` reads `markets`, the
other seven read `spot`. Only `SpotAssetRow` and `SpotTokenBadge` read none.
Reused as they stand under Real assets they would print Spot's wording over
RWA's data. The repo already documents the remedy in
`components/ui/search-field.tsx` lines 13 to 19: a primitive takes its label as
a prop and knows nothing about the message catalogue.

**The RWA trade panel is not a ticket.** `rwa-trade-panel.tsx` is 907 lines. It
carries a 700ms debounced quote with a monotonic sequence guard that discards
superseded responses, a 60 second quote staleness gate, a transient-error retry
with 800/1600ms backoff, a native-gas gate, per-chain USDC, a purchase minimum
that differs by chain, and two Solana settlement legs. A Solana buy whose
on-chain USDC falls short does not trade: it opens a strict Base to Solana
funding request, writes a pending settlement record, and returns, leaving
`RwaSettlementTracker` to finish the purchase later. A Solana sale snapshots
the starting USDC balance, writes a sale handoff record with the minimum
acceptable proceeds, and hands the return trip to the same tracker. Both legs
exist so a closed sheet or a reload cannot strand money. None of it is optional
while Solana sits in `LISTED_RWA_CHAINS`.

The panel also has no side switch. `initialMode` is read once at mount
(`const mode: Mode = initialMode`), because the modal that opens it already
asked Buy or Sell.

## Decision

Four parts.

### 1. Promote the desk chrome below the feature line

The Spot building blocks move from `features/trade/components/` into
`components/ui/`, lose the `spot-` prefix, and take their copy as props. This
is promotion, not duplication, and it follows the test `docs/ARCHITECTURE.md`
sets: membership of `components/ui/` is judged by whether a component knows
anything about a feature, not by how many places import it. A two-pill
buy/sell radiogroup, an amount field with a balance line, a paged asset table:
none of these know what a spot market is.

| Moves to                                 | From                                 | Copy                                                              |
| ---------------------------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| `components/ui/asset-table.tsx`          | `spot-asset-table.tsx`               | four column headers plus `noResults` and the grid label, as props |
| `components/ui/asset-table-row.tsx`      | `spot-asset-row.tsx`                 | none, already clean                                               |
| `components/ui/trade-side-switch.tsx`    | `spot-side-switch.tsx`               | `labels: {group, buy, sell}`                                      |
| `components/ui/trade-amount-card.tsx`    | `spot-amount-card.tsx`               | `labels` of six                                                   |
| `components/ui/trade-sell-shortcuts.tsx` | `spot-sell-shortcuts.tsx`            | `labels: {group, max}`                                            |
| `components/ui/trade-quick-amounts.tsx`  | `spot-quick-amounts.tsx`             | `amountLabel` render function                                     |
| `components/ui/trade-order-summary.tsx`  | `spot-order-summary.tsx`             | `labels` of two per leg                                           |
| `components/ui/trade-actions.tsx`        | `spot-trade-actions.tsx`             | `labels` of nine                                                  |
| `components/ui/trade-pair-header.tsx`    | `spot-pair-header.tsx`               | `labels` of three                                                 |
| `lib/trade/amount.ts`                    | helpers in `spot-amount-card.tsx`    | not applicable, pure                                              |
| `components/ui/desk-layout.ts`           | constants in `spot-desktop-view.tsx` | not applicable                                                    |

`spotAmountStatus`, `acceptsAmountInput`, `formatDecimalString` and
`fractionDigits` are pure and move to `lib/trade/amount.ts`. They must move
with the amount card because `spot-trade-actions.tsx` imports `spotAmountStatus`
across from it.

`DESK_GRID`, `TICKET_PANEL`, `SPOT_ASSET_ROW_HEIGHT`, `SPOT_ASSET_PAGE_SIZE`
and the desk container's `xl:min-h-[calc(100dvh-79px-var(--ws-live-bar,0px))]`
become one `components/ui/desk-layout.ts`. Duplicating the strings into
`features/rwa` would be legal and would drift; one module keeps the two desks
pinned together, and a test pins the numbers the way
`spot-asset-table.test.tsx` line 245 already pins the row height.

`features/trade` keeps its own thin wrappers that bind the promoted primitives
to the `spot` and `markets` namespaces, so no Spot behaviour and no Spot test
changes. The Spot desk renders the same DOM after this step as before it.

Two defects are collapsed on the way through, because promotion is the moment
they stop being invisible: `SpotChangeDirection` is declared twice, in
`spot-asset-row.tsx` line 8 and `spot-pair-header.tsx` line 8, with different
`flat` tones (`text-white/55` against `text-grey-400`); the promoted type is
declared once, and the tone is `text-white/55`, which is what the table renders
today and therefore the one already on screen.

### 2. The Real assets desk mirrors the Spot desk

`features/rwa/components/rwa-desk-view.tsx` composes the promoted primitives in
the same order, with the same geometry, as `spot-desktop-view.tsx`: the capped
search field, the two-column grid, the stretching list panel with its foot
pager, and the `self-start` ticket aside. The fitted row count uses the same
`useFittedRowCount` against the same 58px row and 9 row fallback, behind the
same `(min-width: 1280px)` gate, so both desks page identically at every window
height.

The four columns keep Spot's track and change only what they carry:

| Spot  | Real assets | Why                                                                                                                                                                                                                          |
| ----- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASSET | ASSET       | symbol over name, with the APY pill beside the symbol. Issuer and network move into the ticket rather than the row: the spot row's second line is the asset's name, and keeping it there keeps the two tables the same shape |
| Price | Price       | `assetPriceUsd`, a dash when the registry and the feed both have none                                                                                                                                                        |
| 24h   | 24h         | `market.change24h` from price enrichment, a dash when absent                                                                                                                                                                 |
| Mcap  | Liquidity   | see below                                                                                                                                                                                                                    |

Market cap is not the fourth column. RWA market cap is populated only for
Solana xStocks and, on EVM, by a keyless GeckoTerminal call rate limited to 30
requests a minute globally whose own adapter notes that "nothing depends on it:
a rate-limited response costs a dash". A column that is a dash for most rows is
not a column. `assetLiquidityUsd` is the figure this domain treats as real, it
is populated on both listed chains, and it is already the fourth column of the
table being replaced. The structure is Spot's; the content is Real assets'.

Category tabs, the floated search box, the per-row Buy button and the eyebrow
are removed. Category becomes a line in the ticket, not a filter: the desk
lists about 30 assets after dedupe, which is three pages at the fitted count,
and the search field already narrows them.

### 3. The ticket keeps its execution core

This is the load-bearing decision. The ticket is rebuilt to Spot's structure,
and its execution is not rewritten.

Everything in `rwa-trade-panel.tsx` that is not markup moves unchanged into
`features/rwa/hooks/use-rwa-ticket.ts`: the debounce, the sequence guard, the
staleness gate, the retry, the gas gate, the minimums, the wallet lookup, the
sign-step reporting, the Solana funding leg, the Solana sale handoff, the
settlement subscription and the four analytics events. The hook returns state
and callbacks. `rwa-ticket.tsx` renders the promoted primitives against it and
holds no flow logic of its own.

That split is what `docs/ARCHITECTURE.md` asks for at the 300 line mark, and it
is the only way to reshape this surface without reimplementing money movement.
A ticket written fresh against `useRwaQuote`/`useRwaBuild`/`useExecuteRwa`
would look right and would silently drop the two settlement legs, which is how
funds get stranded on Solana.

The ticket gains what the panel never had, a Buy/Sell switch, and inherits the
rule the Spot switch was built to enforce: the two legs are denominated in
different assets, so flipping the side clears the amount. A buy is entered in
USDC; a sell is entered in the asset, against `holding.decimals`, which is the
only place the asset's on-chain decimals are known. `RwaApiAsset` carries no
`decimals` field, which is why selling stays gated on `isSellableChain`.

Three things the Spot ticket does not have stay, because the RWA flow has no
honest way to drop them: the sign-step line ("Signing step 2 of 3"), the
settlement notice with its Continue in background control, and the issuer-access
card that replaces the whole ticket for an asset that cannot be traded on a DEX.

The chart disclosure keeps Spot's shell and changes its contents. Spot's chart
needs a `coingeckoId`, which `RwaApiAsset` does not have. Real assets chart on
`{chain, address}` through `useRwaPriceHistory` and `PriceChart`, which
`rwa-detail-sheet.tsx` lines 80 to 92 already do. The hook is disabled until
both arguments are non-null, so a collapsed disclosure fetches nothing.

### 4. The phone tab gets the inline ticket

The Real assets tab of the Market page stops opening modals. `RwaPhoneList`
takes the Spot tab's mechanics exactly: the tapped asset is held by id rather
than by object so a price tick cannot leave the ticket pointed at a stale copy;
the list is hidden rather than unmounted and its scroll offset is restored by
hand on the way back, because `hidden` drops the offset the browser was
holding; the page-size measurement passes the active flag; and the back control
in the header closes the ticket before it touches history.

The state stays inside `features/rwa`, behind the existing opaque `rwaSlot`.
`MobileMarketView` owns Spot's and Memecoins' ticket state because it owns
those lists, but it knows nothing about Real assets by design, and teaching it
would mean either a cross-feature import or widening the slot contract. The
`rwa-panel-scroll` testid stays so `mobile-market-view.test.tsx` line 433 keeps
passing.

`RwaDetailSheet` and `RwaTradeModal` are deleted. Everything the detail sheet
showed that is not already in the row moves into the ticket: the chart, APY,
liquidity, market cap where present, network, category, the issuer note, and
the holdings and position-value lines. The issuer link survives as the
issuer-access card the trade panel already renders.

## Consequences

- `features/trade` gains wrapper components and loses nine files to
  `components/ui/`. Its rendered output does not change, and its existing tests
  are the proof.
- `features/rwa` loses `rwa-asset-list.tsx`, `rwa-asset-row.tsx`,
  `rwa-category-tabs.tsx`, `rwa-detail-sheet.tsx`, `rwa-trade-modal.tsx` and
  the markup half of `rwa-trade-panel.tsx`. It gains `rwa-desk-view.tsx`,
  `rwa-ticket.tsx`, `rwa-asset-table.tsx` and `hooks/use-rwa-ticket.ts`.
- `@tanstack/react-table` loses its only RWA caller. The promoted table pages
  by slice, as Spot's does. Whether the dependency stays is a separate question
  and is not decided here.
- About 26 new `rwa.*` strings across five catalogues, taking each from 2721
  keys to about 2747. All five land in the same commit. Two near-collisions are
  deliberately given new keys rather than reused: `rwa.change24h` is "24h", a
  column header, and would be a poor screen-reader announcement where Spot says
  "24h change"; and `rwa.noChart` takes no `{symbol}` where Spot's does.
- The desk stops being able to filter by category. Search covers it at this
  catalogue size; if the catalogue grows past a few hundred, the filter comes
  back as a control inside the search row, not as a tab strip.
- Sorting by column is lost with the react-table dependency. The Spot desk does
  not sort either, and the list is Base-first by default. This is a real
  reduction and is called out rather than hidden.

### Not changed by this ADR

- `RwaSettlementTracker` stays mounted at page scope on `/rwa`, unchanged. It
  is deliberately outside the ticket so a closed ticket cannot strand funds.
- The proxy routes, the registry poll, the price enrichment and every schema.
- The Spot desk's behaviour and its tests.
- A pre-existing defect at `rwa-trade-panel.tsx` line 648: buy-side receive
  decimals are read from `holding`, which is null for a first-time buyer, so a
  first buy never shows a quote-exact estimate and falls back to the price
  feed. It moves into the hook as it stands. Fixing it is a separate change
  with its own failing test first, per Directive 3.
- A pre-existing gap: `RwaSettlementTracker` is mounted on `/rwa` but not on
  `/market`, so a phone reader's Solana settlement is followed only while the
  ticket is open. The inline ticket does not make this worse, and it is not
  fixed here.

## Diagram

Desktop, after:

```
app/(session)/(app)/rwa/page.tsx
  |
  +-- RwaSettlementTracker            page scope, renders null, unchanged
  +-- RwaDeskView
        |
        +-- SearchField                          components/ui
        +-- desk grid                            components/ui/desk-layout
             |
             +-- AssetTable  (left, stretches)   components/ui
             |     +-- AssetTableRow x pageSize
             |     +-- ListPagination
             |
             +-- RwaTicket   (right, self-start)
                   +-- TradePairHeader           components/ui
                   +-- Disclosure -> PriceChart  components/ui
                   +-- TradeSideSwitch           components/ui
                   +-- TradeAmountCard           components/ui
                   |     +-- TradeSellShortcuts  (sell leg only)
                   +-- TradeQuickAmounts         (buy leg only)
                   +-- TradeOrderSummary         components/ui
                   +-- TradeActions              components/ui
                   |
                   +-- useRwaTicket              features/rwa/hooks
                         quote debounce + seq guard + 60s TTL
                         gas gate, minimums, wallet lookup
                         Solana funding leg -> pending settlement
                         Solana sale handoff -> pending settlement
                         useRwaQuote / useRwaBuild / useExecuteRwa
```

Phone, after:

```
app/(session)/market/page.tsx
  +-- MobileMarketView  rwaSlot={<RwaSection phone .../>}
        +-- tab "rwa" -> RwaPhoneList
              ticketAssetId === null  ->  search field + rows + pager
              ticketAssetId !== null  ->  list hidden (offset kept)
                                          RwaTicket, same component as desk
```
