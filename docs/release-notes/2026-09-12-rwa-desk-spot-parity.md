---
date: 2026-09-12
feature: Real assets desk takes the Spot desk's shape
scope: rwa
scenario-impact: needs_automation
---

# The Real assets desk takes the Spot desk's shape

## What changed

`/rwa` is now the same desk as `/spot`. One search field over two panels, the
asset list on the left in a card that reaches the bottom of the window, and the
order ticket on the right carrying the asset pill, the 24h move, a chart behind
a disclosure, a Buy/Sell switch, the amount field, the share shortcuts, the
summary card and one full-width action.

On a phone, the Market page's Real assets tab now behaves like its Spot tab.
Tapping a row swaps the list for the ticket in place. The two modal steps that
stood between a tap and an amount, the detail sheet and then the trade panel,
are gone. The list is hidden rather than unmounted, so a reader eighty rows
down comes back to where they were.

The old surface is removed: the eyebrow heading, the category tab strip, the
floated search box, the per-row Buy button, the detail sheet and the phone
modals.

Three things differ from Spot, each because the data differs:

- The fourth column is **Liquidity**, not market cap. Market cap is populated
  for almost no real asset, so the column would have been a dash on most rows.
- The chart is drawn from the asset's chain and address rather than a CoinGecko
  id, which real assets do not have.
- The ticket keeps three rows Spot has no need for: the signing-step line, the
  settlement notice with its Continue in background control, and the issuer
  card that replaces the form for an asset that cannot be traded on a DEX.

## What was deliberately not rewritten

The buy and sell flows are the ones that were already there. The quote
debounce, the stale-quote gate, the retries, the gas gate, the purchase
minimums and both Solana settlement legs moved into
`features/rwa/hooks/use-rwa-ticket.ts` unchanged, and the ticket renders
against that hook.

That matters because a Solana buy short of on-chain USDC does not trade: it
opens a Base to Solana funding request, writes a pending settlement record and
returns, leaving the page-scope `RwaSettlementTracker` to complete the purchase
later. A Solana sale snapshots the starting balance and hands the return trip
to the same tracker. Both exist so a closed ticket or a reload cannot strand
funds. Rewriting the ticket from the quote and execute hooks would have looked
correct and quietly dropped them.

## What is lost

- **Category filtering.** The catalogue is about 30 assets after dedupe and the
  search field finds any of them. If it grows into the hundreds, filtering
  returns inside the search row rather than as a tab strip.
- **Column sorting.** Spot does not sort either, and the list is Base first by
  default. If it is missed it should return to both desks together.

## Shared components

Nine Spot building blocks moved below the feature line into `components/ui/`
and now take their copy as props instead of reading a message namespace:
`asset-table`, `asset-table-row`, `trade-amount-card`, `trade-actions`,
`trade-side-switch`, `trade-sell-shortcuts`, `trade-quick-amounts`,
`trade-order-summary` and `trade-pair-header`, alongside `desk-layout.ts` and
the pure helpers in `lib/trade/amount.ts`. A feature may not import another
feature, so this is what lets two desks share one shape.

`features/trade` keeps a thin wrapper per component binding the `spot` and
`markets` namespaces. Spot's rendered output did not change, and its existing
tests passing unmodified is the proof.

Two duplicate declarations were collapsed on the way through: the change
direction union, which had two different `flat` tones, and the trade side
union.

## Tests

- `features/rwa/hooks/use-rwa-ticket.test.tsx`: 15 characterisation tests over
  the extracted flows, including quote supersession, the 60 second staleness
  gate, both Solana settlement legs, the gas gate, the purchase minimums and
  that a 100 percent sell stages exactly the raw balance.
- `features/rwa/components/rwa-ticket.test.tsx`: both denominations, quick
  amounts on the buy leg only, shortcuts on the sell leg only, the notices, the
  settlement card and the issuer card.
- `features/rwa/components/rwa-desk-view.test.tsx` and
  `rwa-asset-table.test.tsx`: the desk's paging, clamping, selection, search
  and empty states.
- `features/rwa/components/rwa-phone-list.test.tsx`: the ticket swap, the
  scroll restore, the search field going away with the list, and a second
  spoken command re-opening the ticket.
- `features/rwa/lib/row-view.test.ts`: every missing figure maps to a dash
  rather than a zero.
- New suites beside each promoted primitive in `components/ui/`, each rendering
  with no message provider at all, which is what proves the primitive reads no
  catalogue.

## Locales

18 new `rwa.*` keys in all five catalogues, 2721 to 2739, key paths verified
identical across `en`, `de`, `es`, `fr` and `pt`.

## Known issues, pre-existing and not addressed here

- The settlement effect re-fires the portfolio refresh on every render while a
  settlement is non-terminal, because `tradedNetworks` is rebuilt each render.
- The native gas gate looks unreachable: every chain in `CHAIN_GAS` is
  sponsored, so `requiresNativeGas` returns false for all of them.
- On the buy leg the received-token decimals are read from the holding, which
  is null for a first-time buyer, so a first buy never shows a quote-exact
  estimate.
- `trade_previewed` fires before the gas and wallet checks, and `amount_usd` on
  the sell leg carries asset units rather than USD.
