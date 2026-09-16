---
title: Low-liquidity memecoins ask for consent before a price, and every ticket shows the platform fee
date: 2026-09-14
area: memecoins
adr: ADR-2026-09-14-memecoins-trade-contract
scenario-impact: updated
---

# Release Note: consent, fees and expiry on every trade surface (slice 3 of the trade contract)

The third of five slices bringing the memecoins feature onto the trade
service's frontend contract (`trade-llms.txt`). This one makes every place a
memecoin can be traded tell the trader the same things before money moves:
the risk, the warnings, the fee, and whether the price on screen is still a
price. For a coin with thin liquidity, it asks first.

## What changed

- **Low-liquidity consent, before any quote.** A token the service flags
  `LOW_LIQUIDITY` (known liquidity under $50,000) now opens a confirmation the
  first time an amount is entered for it. The dialog (`role="alertdialog"`)
  shows the service's own `LOW_LIQUIDITY` message first, then any other
  warning worth showing, the risk badge and the disclaimer, with "I understand,
  continue" and "Cancel". Until it is accepted, **no preview is requested**:
  `useMemePreview(input, consented)` only enables its query when the consent
  hook says so, and each surface also refuses to run the trade. Cancel (the
  button, the backdrop or Escape) clears the amount. The acknowledgement lasts
  the session (this tab, until reload) and belongs to one token, keyed
  `chainId:address`; a Solana mint is kept exactly as written. Tokens without
  the warning never see the dialog. `BLOCKED`, `buyEnabled: false` and
  `sellEnabled: false` keep disabling the action exactly as before.
- **Where the consent applies.** The trade sheet, the desktop desk (buy ticket
  and sell panel), the phone Market page's Memecoins ticket, the phone board,
  and the spot buy sheet's cbDOGE swap path, whose `trade()` quotes with no
  preview in front of it, so its Buy action waits on the consent. The sheet's
  Solana pre-move, which queues a purchase quoted later, waits on it too.
- **Risk badge and warnings on every ticket.** The desktop buy ticket, the
  desktop sell panel and the phone ticket now show the risk level, up to three
  visible warnings and the unknown-liquidity line, as the sheet already did.
  `visibleWarnings` still drops the upgradeable-proxy line (a recorded
  maintainer deviation from "display other automated warnings").
- **Platform fee row.** Every ticket and the sheet show "Platform fee" from the
  preview's `platformFeeAmountFormatted`, labelled USDC. While a Solana trade
  runs, the sheet shows the executable quote's own `platformFeeAmountAtomic`,
  read as a bigint at six decimals (`formatUsdcAtomic`). Nothing states a rate.
- **Expiry in one place.** The sheet's `expiresAt` timer moved into
  `useMemePreview`, which now returns `quote`, `expired` and `refetch` beside
  the query's `isFetching` and `error`: `quote` is null from the moment the
  quote lapses. The desk, the
  phone ticket and the board blank a lapsed quote the same way the sheet does,
  and say "Your price lapsed. Get a fresh quote and try again." with a Try
  again button.
- **Desk parity.** The desktop desk re-reads the selected coin through
  `useMemeToken` and trades on that read (its risk block and buy/sell switches),
  keeping the catalogue row only until the read lands. A preview refused with
  `WALLET_OWNERSHIP_MISMATCH` links the wallet once per chain and asks again,
  through the same `usePreviewRelink` the sheet now uses.
- **Stacked dialogs.** The sheets' shared dismissal treats an alert dialog as a
  modal on top, so Escape on the consent cancels it without closing the trade
  sheet beneath.

## Copy

New `meme` keys, in en, de, es, fr and pt:

- `consentTitle`: "Before you trade {symbol}"
- `consentContinue`: "I understand, continue"
- `platformFee`: "Platform fee"
- `quoteExpired`: "Your price lapsed. Get a fresh quote and try again." (the
  sheet already read this key from `meme`, where it did not exist; it now does)

The dialog's body is the service's own warning text; its disclaimer and
Cancel reuse `meme.riskDisclaimer` and `meme.cancel`.

## Tests

- `features/trade/hooks/use-risk-consent.test.tsx` (new): no consent for a
  token without `LOW_LIQUIDITY`; prompts only once an amount is entered;
  accepted consent is shared across surfaces for the session; keyed per token
  and chain; a Solana mint case-sensitive, a Base address not.
- `features/trade/hooks/use-meme-trade.test.tsx`: `previewSwap` is not called
  for a `LOW_LIQUIDITY` token until the consent is accepted, then called once;
  called straight away for an unflagged token; `expired` flips at `expiresAt`
  under fake timers and `quote` becomes null; a Solana quote's fee is carried
  as `123456789012345.678901` (past 2^53 base units), and null when absent.
- `lib/meme/format.test.ts`: `formatUsdcAtomic` at six decimals, bigint-safe,
  null for non-integer input; the fee symbol is USDC.
- `features/trade/components/meme-risk-consent.test.tsx` (new): alertdialog
  role and name; the service message first; upgradeable line dropped; badge and
  disclaimer; continue vs cancel/Escape.
- `features/trade/components/meme-trade-ticket.test.tsx`,
  `meme-sell-panel.test.tsx`: badge and warnings; the fee row from the preview
  in USDC, a dash with no preview; the lapsed-quote line and its retry. The
  ticket's "four unknowns" assertion is now five, the fee being the fifth.
- `app/(session)/(app)/meme/page.test.tsx`: badge and warnings on both desk
  halves; the fee row; a lapsed quote blanked; the fresh read wins over the
  catalogue row; relink and refetch on a 403 preview; consent before any
  preview, cancel clears, unflagged coins never prompt. The preview mock moved
  to the new hook shape.
- `features/trade/components/meme-trade-sheet.test.tsx`: the expiry test now
  reads the hook's `expired` (the timer itself is pinned in the hook test) and
  also asserts the retry; the fee row from the preview and from the Solana
  quote; consent before preview, Escape cancels the consent without closing
  the sheet.
- `features/trade/components/mobile-market-view.test.tsx`,
  `meme-board.test.tsx`: the phone ticket is handed the live quote and the
  lapse; consent holds the preview. `meme-trade-sheet-preview.test.tsx`: mock
  moved to the new hook shape.
- `features/trade/components/buy-sheet.test.tsx` (new): the cbDOGE swap path's
  Buy waits on the consent; cancel quotes nothing; an unflagged token is not
  asked.

## Still needed from the backend

- **The preview's fee token and recipient.** The contract lists "platform fee
  amount/token/recipient" for the preview; the schema (and every response
  seen) carries only `platformFeeAmountAtomic` and
  `platformFeeAmountFormatted`. The row is labelled USDC from the contract's
  "all platform fees settle in USDC", not from a field. No field was invented.
- **A fee on the Base executable quote.** Only the Solana quote states one
  (`platformFeeAmountAtomic`, optional in the schema); a Base trade shows the
  preview's fee.

`scenario-impact: updated`: the memecoin trade scenarios now include a
consent step for low-liquidity coins before any price appears, a platform fee
row on every ticket, and a lapsed-quote state on the desk and phone tickets.

## First-load weight

The consent dialog, the warnings and badge on every ticket, and the fee row
put `/meme` at 1651 kB against a 1650 kB budget, with slice 2's zod already
moved out of the initial payload. What crossed the line is safety UI the trade
contract requires on every surface, not a regression, so the `/meme` budget in
`scripts/first-load-budget.json` rises from 1650 to 1660 kB. That also leaves
room for slice 4's paging controls (measured at 1654 kB). `/spot` stays at
1650 and is not affected (1647 kB).
