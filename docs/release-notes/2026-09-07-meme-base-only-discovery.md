---
title: Memecoin discovery temporarily Base-only
date: 2026-09-07
area: memecoins
adr: ADR-2026-09-07-memecoin-one-usd-balance
scenario-impact: none
---

# Release Note: memecoin discovery shows Base rows only, for now

## What changed

The Solana gas-sponsor wallet is unfunded (0.00119 SOL on 2026-09-07), so
every sponsored Solana send fails at the rent for a token account and no
Solana memecoin can be bought or sold. Until it is topped up, the catalogue
boundary drops Solana rows: the board, search, trending and the dashboard
feed show Base coins only. Nothing on screen names a chain; the rows are
simply absent.

## Undo

One line: `DISCOVERY_CHAINS` in `lib/meme/catalog.ts`. The Solana trading
path is untouched and returns the moment that set includes Solana again.
Three tests carry the same TEMPORARY marker and flip back with it.
