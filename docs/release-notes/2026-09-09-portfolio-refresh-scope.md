---
title: Balances after a trade without the 28-network sweep
date: 2026-09-09
area: portfolio, funds
scenario-impact: none
---

# Release Note: scoped fresh reads, one ramp clock, dry withdraw previews, a read fallback

## What changed

**Portfolio.** A fresh read after a trade now names the networks the trade
touched (`fresh=base-mainnet`) and the server re-reads only those; the other
27 networks and the Solana leg answer from their caches. The legacy `fresh=1`
still sweeps everything. The receipt of a memecoin trade is applied to the
cached balance the moment it lands, before any re-read. About two chain calls
after a trade instead of about 340, and the balance is right seconds sooner.

**Incomplete snapshots.** When a network misses the sweep's deadline the
portfolio now says which (`missing`), the server keeps that snapshot for 5 s
instead of 75, and the client polls again in 5 s instead of 60. A cold
render that lost Base used to show the Solana-only total for a minute.

**Bank ramp.** One order was polled by three parts of the dashboard at three
intervals; React Query ran the shortest. The hook now owns one cadence: every
3 s for the first minute after the order is created or the user says the
money is sent, every 15 s after, off once terminal, off in a background tab.

**Crypto withdraw.** The preview asks Dextopus for a dry quote, which prices
without reserving a deposit address, keyed on the price fields only. The real
strict quote is fetched once at submit, as before. The casino fund sheet
follows the same shape.

**Read proxy.** `/api/evm-rpc` reads through the same pool as the server
sweep: ZeroDev first, the Alchemy key pool when ZeroDev is rate limited or
does not serve the chain, each fallback logged with the chain and reason.
It no longer fails closed without a ZeroDev project.

## Files

- `lib/portfolio/fresh-scope.ts`, `lib/portfolio/apply-transfers.ts` (new)
- `app/api/portfolio/route.ts`, `lib/server/alchemy.ts`,
  `lib/server/portfolio-holdings.ts`
- `hooks/use-portfolio.ts` and every caller of its fresh reads
- `features/trade/hooks/use-meme-trade.ts`: applies the receipt
- `hooks/use-ramping.ts`, the bank transfer and withdraw screens, the
  settlement watcher
- `hooks/use-deposit.ts`, `features/funds/components/crypto-withdraw-screen.tsx`,
  `features/casino/components/last-standing/fund-sheet.tsx`
- `lib/server/evm-rpc.ts`

## Decision records

- `docs/adr/ADR-2026-09-09-portfolio-refresh-scope.md`
- `docs/adr/ADR-2026-09-09-portfolio-refresh-scope-for-dummies.md`

## Verification

- `lib/portfolio/*.test.ts`: the scope parser and the transfer patch.
- `app/api/portfolio/route.test.ts`, `lib/server/alchemy.test.ts`: which
  networks a scoped fresh read re-reads.
- `hooks/use-portfolio.test.tsx`, `__tests__/portfolio-settle.test.ts`.
- `hooks/use-ramping.test.tsx`: cadence with three observers, the paid
  marker, terminal stop.
- `hooks/use-withdraw-quote.test.tsx`: dry preview, price-only key, real
  quote at submit.
- `lib/server/evm-rpc.test.ts`: fallback on 429, on an unserved chain, with
  no ZeroDev project; fails closed only with no provider at all.
- Manual: a memecoin buy and sell, a bank deposit order, a withdraw preview
  on the dev server with the Network tab open.
