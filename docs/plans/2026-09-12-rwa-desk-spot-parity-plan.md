# Implementation plan: the Real assets desk takes the Spot desk's shape

Companion to `docs/adr/ADR-2026-09-12-rwa-desk-spot-parity.md`. Branch:
`fix/spot-buy-sell-denomination`. Do not start before both ADRs are approved.

## Ordering

Five stages. Each ends green on `./scripts/preflight.sh`, so a stage can be
reviewed, or abandoned, on its own. Stages 2, 3 and 4 are independent of each
other once stage 1 has landed, and are the ones worth running in parallel.

```
Stage 1  promote the chrome            (blocks everything)
   |
   +-- Stage 2  desk shell + table     |
   +-- Stage 3  ticket + execution hook| parallel
   +-- Stage 4  phone tab              |
   |
Stage 5  delete the old UI, locales, docs
```

Stage 4 needs the ticket from stage 3 to render, so it is built against the
component's contract and wired last. The contract is fixed in stage 1 and does
not move.

## Stage 1: promote the desk chrome

Behaviour-preserving refactor. Nothing renders differently at the end of it.

1. `lib/trade/amount.ts`: move `fractionDigits`, `acceptsAmountInput`,
   `spotAmountStatus` (renamed `amountStatus`) and `formatDecimalString` out of
   `spot-amount-card.tsx`, with their tests.
2. `components/ui/desk-layout.ts`: `DESK_GRID`, `TICKET_PANEL`,
   `ASSET_ROW_HEIGHT = 58`, `ASSET_PAGE_SIZE = 9`, `DESK_CONTAINER`,
   `SIDE_BY_SIDE`, and `useSideBySideDesk`. Strings copied verbatim.
3. Move the nine components into `components/ui/` under the names in the ADR
   table. Each loses `useTranslations` and gains a `labels` prop, or a single
   label prop where there is one key. `SpotChangeDirection` is declared once,
   `flat` is `text-white/55`.
4. `features/trade/components/` keeps one thin wrapper per promoted component,
   same exported name as today, binding `useTranslations("spot")` or
   `("markets")` to the `labels` prop. Every existing import in `features/trade`
   is untouched.

Done when: `spot-desktop-view.test.tsx`, `spot-ticket.test.tsx`,
`spot-asset-table.test.tsx`, `spot-amount-card.test.tsx`,
`spot-side-switch.test.tsx`, `spot-sell-shortcuts.test.tsx`,
`spot-order-summary.test.tsx` and `spot-trade-actions.test.tsx` all pass
unmodified. If a spot test needs editing, the promotion changed behaviour and
is wrong.

New tests: one per promoted primitive asserting it renders the labels it is
given and reads no catalogue, plus `desk-layout.test.ts` pinning 58 and 9.

## Stage 2: the desk shell and the table

1. `features/rwa/lib/presenter.ts`: add `toRwaRowView(asset): AssetRowView`
   mapping symbol, name, logo, `assetPriceUsd`, `formatChange`,
   `assetLiquidityUsd` and the APY pill, with a dash for every absent figure.
   Pure, unit tested, no component involved.
2. `features/rwa/components/rwa-asset-table.tsx`: binds the promoted
   `AssetTable` to the `rwa` namespace and the four column labels.
3. `features/rwa/components/rwa-desk-view.tsx`: the composition layer. Search
   field, `useFittedRowCount`, page clamp, selection, the two-column grid, the
   loading skeleton built from the table's own box model. Mirrors
   `spot-desktop-view.tsx` structurally.
4. `app/(session)/(app)/rwa/page.tsx`: render `RwaDeskView`, keep
   `RwaSettlementTracker` and the modal host for Add funds.

Tests: row-view mapping including every dash case; the desk renders one row per
asset and pages at the fitted count; the page clamps when the catalogue
shrinks; selection drives the ticket; loading, empty, error and no-results
states; the grid, stretch and `self-start` class assertions the Spot desk test
already makes.

## Stage 3: the ticket and its execution hook

The stage with the money in it. Extract first, reshape second, and prove the
extraction before touching any markup.

1. `features/rwa/hooks/use-rwa-ticket.ts`: move the non-markup half of
   `rwa-trade-panel.tsx` across **unchanged**. Quote debounce, `quoteSeqRef`,
   `quotedAtRef` and the 60s gate, `withTransientRetry`, the gas gate,
   `minimumBuyUsd`, `getWalletAddress`, `signStep`, the Solana funding leg with
   `savePendingRwaSettlement`, the Solana sale handoff with its
   `startingUsdcRaw` snapshot and `clearPendingRwaSettlement` on throw, the
   `useDepositStatus` subscription, and the four analytics events.
   Returns `{amount, setAmount, side, setSide, phase, quote, notice, signStep,
settlement, canConfirm, confirm, reset, holding, payBalance, ...}`.
2. Characterisation tests on the hook before anything is reshaped: a superseded
   quote response is discarded; a quote older than 60s re-quotes instead of
   executing; a Solana buy short of on-chain USDC creates a funding request and
   does **not** trade; a Solana sale writes a handoff record and clears it when
   the build throws; the gas gate blocks on a chain that needs native gas; a
   sale of 100% stages exactly the raw balance through `pctOfRawBalance`.
   These are the regression net for the whole stage.
3. `features/rwa/components/rwa-ticket.tsx`: the Spot ticket's structure against
   that hook. Pair header, chart disclosure fed by `useRwaPriceHistory`, side
   switch, amount card with sell shortcuts in its footer, quick amounts on the
   buy leg only, summary, actions. Plus the three RWA-only pieces: sign-step
   line, settlement notice with Continue in background, issuer-access card as an
   early return.
4. Side flip clears the amount, same guard as Spot, for the same reason: the
   legs are denominated in different assets.

Tests: buy leg denominated in USDC and sell leg in the asset; flipping clears;
sell disabled with no holding and the reason named; quick amounts absent on the
sell leg; issuer-access renders the card and no form; every async state has a
loading and an error rendering and none freezes the UI.

## Stage 4: the phone tab

1. `rwa-phone-list.tsx`: `ticketAssetId` state, hold by id not object, hide the
   list rather than unmount it, save and restore `scrollTop` in a
   `useLayoutEffect`, pass the active flag to `useFitRows`.
2. `rwa-section.tsx`: the phone branch renders the list or the ticket, no
   `ModalShell`. Keep `onAddFunds` reaching the ticket. Re-point the voice
   prefill (`useTradePrefill`) at the ticket, since it currently opens a modal.
3. `mobile-market-view.tsx`: the back control must close an open RWA ticket
   before touching history, as it does for Spot and Memecoins. This is the one
   edit outside `features/rwa`, and it is a wiring change inside an existing
   handler.

Tests: tapping a row opens the ticket and hides the list; back returns to the
list at the same scroll offset; the search field is gone while the ticket is
open; changing tab clears the ticket; `rwa-panel-scroll` still present;
`mobile-market-view.test.tsx` line 433 still passes. Update the two existing
`rwa-phone-list.test.tsx` assertions that pin the old structure.

## Stage 5: removal, locales, documentation

1. Delete `rwa-asset-list.tsx`, `rwa-asset-row.tsx`, `rwa-category-tabs.tsx`,
   `rwa-detail-sheet.tsx`, `rwa-trade-modal.tsx` and their tests. Reduce
   `rwa-trade-panel.tsx` to nothing if no caller remains, or to the issuer card
   if one does. Update `features/rwa/index.ts`.
2. Locales: about 26 new `rwa.*` keys into all five catalogues in one edit,
   append-only, no reordering. Verify by comparing key **paths** with python3,
   never by grepping English strings: a correct translation is exactly what will
   not match. All five must end at the same count.
3. `knip` for anything orphaned, including `@tanstack/react-table` if the RWA
   table was its last caller.
4. Release note under `docs/release-notes/2026-09-12-rwa-desk-spot-parity.md`
   with `scenario-impact`.

## Verification

`./scripts/preflight.sh` clean at the end of every stage: format, lint,
typecheck, Vitest, production build. Lint matters more than usual here, because
`eslint-plugin-boundaries` is what proves no cross-feature import was
introduced.

Then the dev server, by hand, at 1280px and above, in the 768 to 1279 stacked
range, and at phone width:

- the list reaches the bottom of the window and the pager sits on the panel
  foot, with no black band under the last row
- opening the chart repaginates the list, as the Spot desk does
- buy and sell on a Base asset, end to end
- a Solana buy with USDC only on Base: the funding request is created, the
  purchase completes in the background, and it survives a reload mid-flight
- a Solana sale: proceeds return to Base
- an issuer-access asset shows the card and no form
- phone: tap, ticket, back, scroll offset kept, tab change clears

The Solana paths are the ones to exercise in the Vercel preview rather than
trusting the unit tests, because they cross a network boundary the tests stub.

## Risks

| Risk                                                     | Mitigation                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| The settlement legs are lost in the reshape              | Stage 3 extracts before it reshapes, and the characterisation tests in 3.2 are written against the old behaviour first |
| The promotion changes Spot                               | Stage 1 is done when every existing Spot test passes unmodified                                                        |
| A cross-feature import creeps in                         | `pnpm lint` fails on it; it is a CI gate, not a review nit                                                             |
| Locale drift across five files                           | One edit, append-only, key-path parity check                                                                           |
| Another session switches this shared checkout mid-flight | Peers notified and holding; work committed at each stage boundary rather than left uncommitted                         |
