# ADR-2026-09-07: One USD balance for memecoins on either chain

## Status

Accepted — 2026-09-07. Directed by the maintainer after confirming with the
trade backend that Solana memecoins follow the real-asset wiring: fund the
Solana wallet from Base USDC first, then execute sponsored.

## Context

ADR-2026-09-06 made the memecoin sheet chain-aware. It also made the chain the
user's problem: a Solana coin read the Solana wallet's USDC, which is empty for
almost everyone, and said "Not enough balance" beside a Base balance that
could have paid for it. Cards and the sheet named Base and Solana.

The product rule is that the user has one USD balance and never sees a chain.
Real assets already do this (`features/rwa/components/rwa-trade-panel.tsx`,
`rwa-settlement-tracker.tsx`): a Solana asset counts Base USDC as spendable;
on confirm, a strict Dextopus request moves the shortfall to the user's
Solana wallet; a dashboard-level tracker completes the purchase once the USDC
lands, even if the sheet was closed; a Solana sale's proceeds are routed back
to Base USDC by the same tracker.

The trade service's `/solana/swaps/preview` enforces the Solana wallet's
balance (`solana-swap.service.ts` `prepare`), so no quote can be shown until
the move has landed.

## Decision

Mirror the real-asset wiring for memecoins, sharing its loop rather than
copying it.

```
lib/trade/pending-settlement.ts      + product: "rwa" | "meme", settlementsForProduct()
hooks/use-settlement-reconciler.ts   NEW: the loop, extracted from the RWA tracker
features/rwa/.../rwa-settlement-tracker.tsx   now a thin wrapper (build + execute RWA)
features/trade/.../meme-settlement-tracker.tsx NEW wrapper (useMemeTrade on Solana)
lib/meme/funding.ts                  buyFunding(), estimateReceive(), usdcFromRaw()
features/trade/.../meme-trade-sheet.tsx  one USD balance, funding step, sale handoff
app/(session)/(app)/{dashboard,meme}  mount MemeSettlementTracker beside the RWA one
```

- **Balance.** BUY shows one figure, labelled USD: Base USDC, plus Solana USDC
  when the coin is on Solana. Nothing on screen names a chain; the chain tag
  and the chain tabs are gone.
- **Funding.** `buyFunding()` decides whether a move is needed (Solana coin,
  Solana USDC short), how much (the shortfall, floored at the 2 USD Solana
  minimum, surplus kept for the next buy) and whether Base USDC covers it.
- **While a move is needed** the sheet cannot ask the service for a preview,
  so it shows an estimate from the listed price, marked as such. Confirm
  moves the USDC through `useReroutedWithdraw("trade")`, saves a `product:
"meme"` purchase entry (mint, amount, starting Solana USDC, minimum
  delivery), toasts "order accepted", and closes.
- **The tracker** finishes the purchase with the existing `useMemeTrade`
  Solana path (link, quote, sponsor, sign, register, poll), spending only the
  delivered increase, never an unrelated balance. Failure after the move
  leaves the USDC in the Solana wallet and says so; a retry from the sheet
  spends it without moving anything again.
- **Selling on Solana** records the quote's expected and minimum USDC before
  signing; after the trade the tracker routes exactly those proceeds back to
  Base USDC. The toast says the proceeds are on their way to the USD balance.
- **Product scoping** keeps the two trackers apart. An entry without a product
  is a real-asset entry, so nothing already stored changes meaning.

## Consequences

- The RWA tracker's behaviour is unchanged; its loop moved to `hooks/`. The
  memecoin tracker is ~90 lines rather than a second copy of 270.
- A Solana purchase funded from Base is two legs, and the second runs in the
  background. The dashboard and the memecoin page both mount the tracker; a
  user who closes the tab before the USDC lands sees the purchase complete on
  their next visit, within the 24 h entry TTL.
- Base memecoin buys are unchanged here and still fail verification on the
  backend (transaction target check vs sponsored user operations), reported
  separately.

## Tests

Red first: `lib/trade/pending-settlement.test.ts` (product scoping, legacy
entries, persistence), `lib/meme/funding.test.ts` (spendable, shortfall,
floor, cannot fund, estimate, raw formatting). Full suite green; RWA tests
pass on the extracted hook.
