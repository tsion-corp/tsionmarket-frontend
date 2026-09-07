---
title: Memecoin board
date: 2026-09-07
area: memecoins
adr: ADR-2026-09-07-memecoin-board
scenario-impact: needs_automation
---

# Release Note: the memecoin page is a board

## What changed

`/meme` is one page: a trending shortlist and the whole catalogue as cards,
each with search and risk-band filters, plus a network switch (All chains,
Base, Solana) on the catalogue. Every card names its network. Tapping a coin
opens the buy/sell sheet directly. The Simple/Pro switch, the pro table and
the chart are gone.

Wrapped Bitcoin (cbBTC) is dropped from the memecoin lists at the boundary,
alongside the quote currency.

Failures have a state: catalogue, trending or search down shows a message and
a Try again control instead of an empty list.

## Scenarios

- Open `/meme`: trending and the catalogue load with skeletons, then cards.
- Pick Solana in the network switch: the catalogue reloads with only Solana
  coins; the request carries `?chain=solana`.
- Tap a Critical chip: only critical coins remain; an empty band says so.
- Type two or more characters: the list is replaced by search results.
- Kill the trade service: each list shows the unavailable state; Try again
  refetches.

`scenario-impact: needs_automation` — the page needs a signed-in Privy
session, so the flows above were verified with component tests and by
probing the proxy; a browser scenario is still to be written.

## Known upstream faults, reported to the trade team

- `GET /tokens/search` returned an empty array for every query on
  2026-09-07, including a mint it matched on 2026-09-06.
- `GET /tokens/trending` returned zero rows; the client falls back to the
  Base catalogue as before.
- `GET /tokens/{mint}?chain=solana` answers `PROVIDER_ERROR` for mints
  outside the persisted catalogue; the sheet opens with the row instead.
