---
title: Solana memecoins, sponsored
date: 2026-09-07
area: memecoins
adr: ADR-2026-09-06-solana-memecoin-trading
scenario-impact: needs_automation
---

# Release Note: Solana memecoins can be bought and sold, gas-free

## What changed

The memecoin surface trades on Solana as well as Base. A token's `chainId`
now drives everything chain-specific: which wallet pays and holds, how the
wallet is linked, which quote route is called, how the trade is executed
and how the submission is registered. Base is unchanged.

Solana execution reuses the sponsored send already used for withdrawals:
the quote's one unsigned transaction goes to the gas-sponsor service, the
user signs once, the sponsor submits, the signature is registered with the
trade service, and the shared status poll decides success. Users never need
SOL.

## User-visible

- Solana coins appear in Trending, search and the catalog and are tradable.
- The first Solana trade asks for one wallet-link signature, as Base did.
- Sell amounts and Max come from the Solana balance for that mint.
- "Received" (the on-chain balance-delta proof) is Base-only for now; Solana
  shows the backend's CONFIRMED.

## Supersedes

`fix/meme-scope-to-base`, which hid Solana rows as a stopgap. Its
chain-naming on the detail routes is kept and generalised.

## Known backend issue found while building

`GET /tokens/{mint}?chain=solana` answers `PROVIDER_ERROR "Solana RPC is
unavailable"` for mints that need a fresh on-chain read (BONK, the search
results); mints already in the catalog resolve. The sheet falls back to the
listed row, so the coin still opens. Reported to the trade team.

## Scenarios

- needs_automation: one funded Solana BUY and SELL reaching CONFIRMED in the
  preview deployment; one Base BUY unchanged; expired quote, risk block,
  insufficient balance and sponsor 502 paths.
