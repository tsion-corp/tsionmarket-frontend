---
title: Majors and impersonators off the memecoin board
date: 2026-09-07
area: memecoins
adr: ADR-2026-09-07-memecoin-board
scenario-impact: none
---

# Release Note: majors and their impersonators are kept off the memecoin board

## What changed

The catalogue boundary drops each chain's wrapped gas token (wrapped SOL on
Solana, WETH on Base) by address, and any row whose symbol or name claims to
be a major (SOL, ETH, BTC, USDC, USDT and their long forms) by name. On
2026-09-07 that was 41 of 443 rows: 19 called "SOL", 16 called "ETH", all
impersonators with fabricated liquidity. Trading never identifies a token by
symbol; this is a display rule for a discovery surface, and a stopgap until
the trade service stops indexing them. Reported to the trade team.
