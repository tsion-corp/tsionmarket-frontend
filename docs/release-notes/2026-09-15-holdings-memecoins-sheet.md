---
date: 2026-09-15
feature: Memecoins move into the Your holdings sheet
scope: portfolio
scenario-impact: updated
---

# Memecoins move into the Your holdings sheet

## What changed

The Memecoins section no longer sits on the portfolio page (and so the
dashboard) under the promo rail. It lives in the "Your holdings" sheet that the
balance card's coins button opens, as the second of two views.

- **Coins / Memecoins.** The sheet opens on Coins, the list it always showed.
  Memecoins is one tap away, drawn in the pill tabs the Kash history sheet uses.
  Nothing is asked of the trade service until Memecoins is picked.
- **The Memecoins view** is a bordered summary card (current value in the
  display face, total P&L with its return, realised P&L and when it was
  calculated), then Open, Closed, Activity, Base and Solana pill tabs that stick
  while the list scrolls.
- **A position row** is drawn as a Coins row: logo with its network badge,
  symbol and amount, value and P&L. An amber dot marks a position whose details
  carry a warning. Tapping the row opens it in place with the shared disclosure
  animation: holding, average entry, the price and its age, realised P&L, its
  trades, and a full-width Sell button.
- **Logos** come from the service when it sends one, otherwise from the app's
  token-logo route, with the gradient coin as the fallback, as the Coins view
  does.
- **Selling** from a position closes the sheet and hands the coin to the meme
  trade sheet, as a coin row does.

Every rendering rule the section carried is kept: "Valuation unavailable" for
an unpriced mark, the stale-price label, ledger-derived quantities, partial
cost basis, paused selling, the valuation disclaimer, paging and retries.

## Strings

`portfolio.holdingsViewsLabel`, `holdingsViewCoins`, `holdingsViewMemecoins` and
`memePositions.trades` are added in all five catalogues.
`memePositions.subtitle`, `colValue`, `colPnl`, `sell`, `tradesShow` and
`tradesHide` are removed, as nothing reads them any more.

## Scenario impact

A scenario that finds the Memecoins section on the portfolio page now opens the
coins button on the balance card and picks Memecoins.

## Tests

- `holdings-modal.test.tsx`: opens on Coins without mounting the Memecoins view;
  swaps views both ways; a position's Sell closes the sheet and reaches the meme
  trade sheet.
- `meme-positions.test.tsx`: the contract's rendering rules, now checked with the
  row opened where the detail lives, plus the logo lookup and the open and fold
  behaviour.
