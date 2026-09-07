---
title: Real assets hidden from the navigation
date: 2026-09-07
area: navigation
scenario-impact: none
---

# Release Note: real assets hidden from the navigation, for now

## What changed

Real assets are commented out of the reorderable sections and the interest
map in `lib/sections.ts`, exactly as perpetuals and earn are. The rail, the
tab bar, the marquee and the dashboard briefs all follow that order, so they
drop it together. `/rwa` itself is unchanged, existing holdings still show
in the portfolio, and the settlement tracker keeps finishing any in-flight
Solana settlement.

Interests that pointed at real assets (stocks, gold, yield, real estate,
treasuries) fall back to the default order.

## Undo

Uncomment the six lines marked TEMPORARY in `lib/sections.ts`.
