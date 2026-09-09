---
title: Portfolio and activity polling at 30,000 users
date: 2026-09-09
area: portfolio, activity
scenario-impact: none
---

# Release Note: a signed-in tab costs less than half the provider calls

## What changed

An idle signed-in tab made about 600 provider calls an hour: the wallet on
5 hot networks every 60 s, 23 cold networks every 10 min whatever they
held, a history sweep every 5 min against a 90 s cache, and the Solana leg
and prices along with them.

- **Cold networks that keep answering empty back off**: 10 min, then 1 h,
  then every 2 h. Any balance puts them back on the hot cadence. A fresh
  read goes through regardless, and "Refresh balance" now reads every
  network fresh.
- **The portfolio poll follows the page**: 60 s on `/portfolio` and
  `/dashboard`, 3 min elsewhere, where only the balance chip reads it.
- **History is served longer and asked less**: server cache 5 min, the
  bell every 10 min, the activity page every 2 min. The sweep itself is
  unchanged.
- **The balance is prefetched on the server for every session page**,
  not only the dashboard.

About 260 provider calls per active user per hour after this, from about 600. One visible edge: a first-ever transfer on a network the wallet has
never used can take up to 2 h to appear unless the user taps Refresh.
Deposits settle on Base and are unaffected.

## Files

- `lib/server/portfolio-holdings.ts`, `lib/server/activity.ts`
- `hooks/use-portfolio.ts`, `features/activity/hooks/use-activity.ts`
- `features/funds/components/crypto-deposit-screen.tsx`
- `app/(session)/(app)/layout.tsx`

## Decision records

- `docs/adr/ADR-2026-09-09-portfolio-polling-at-scale.md`
- `docs/adr/ADR-2026-09-09-portfolio-polling-at-scale-for-dummies.md`

## Verification

- `portfolio-holdings.test.ts`: the backoff steps, the reset on a balance,
  the fresh bypass.
- `use-portfolio.test.tsx`: 60 s on the portfolio page, 3 min elsewhere.
- `activity.test.ts`: one sweep serves five minutes.
- `use-activity.test.tsx`: bell every 10 min, page every 2 min.
- Manual: the dashboard and the spot page left open on the dev server with
  the server log counting upstream reads.
