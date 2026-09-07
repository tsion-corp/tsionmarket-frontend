---
title: Memecoins from one USD balance
date: 2026-09-07
area: memecoins
adr: ADR-2026-09-07-memecoin-one-usd-balance
scenario-impact: needs_automation
---

# Release Note: any memecoin, one USD balance, no chain on screen

## What changed

The memecoin buy/sell sheet shows one balance in USD. A coin on Solana is
funded from that balance: on Buy, the shortfall is moved to the user's Solana
wallet through the strict Dextopus route real assets use, and a dashboard-
level tracker completes the sponsored purchase when it lands. Selling such a
coin routes the proceeds back to the USD balance automatically. Chain names
are gone from cards and the sheet, and the chain tabs are gone from the
board (they had reached `main` in #387 before the follow-up).

The settlement loop the real-asset tracker used is now a shared hook; both
trackers use it, and entries in the shared store are scoped by product.

## Scenarios

- Solana coin, Solana USDC empty, Base USDC 7: sheet shows Balance 7 USD,
  an estimate under "You receive", Buy → "Order accepted…" → sheet closes →
  toast when the coin lands.
- Solana coin, amount above Base USDC: "Not enough balance" and a line saying
  how much the buy needs.
- Solana coin, amount below 2: "Minimum $2".
- Sell a Solana coin: "Sold. Moving the proceeds to your USD balance…" then a
  toast when they arrive.
- Base coin: unchanged.

`scenario-impact: needs_automation` — the funding and background legs need a
signed-in session with funds; verified by unit tests and the dev server on
port 3001, not by an end-to-end run.

## Still broken upstream

Base memecoin buys fail the trade service's verification because sponsored
user operations do not match its transaction target check. Reported with the
fix described.
