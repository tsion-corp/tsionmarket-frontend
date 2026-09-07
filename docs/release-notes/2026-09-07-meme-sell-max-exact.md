---
title: Memecoin sells sized from the exact holding
date: 2026-09-07
area: memecoins
adr: ADR-2026-09-07-memecoin-board
scenario-impact: none
---

# Release Note: Max on a memecoin sale is the exact holding

## What changed

Max on the sell side filled the input from the portfolio's float balance
rendered at the token's decimals, which produced digits the wallet never held
(4230.10614345841349 for a 4,230.106143 holding). The trade service compared
that with the real balance and answered "Wallet balance is insufficient".

The sheet now sizes sales from the holding's base-unit balance: Max fills the
exact amount and the over-balance check compares in base units, so a Max
amount never reads as over. Buys are unchanged.
