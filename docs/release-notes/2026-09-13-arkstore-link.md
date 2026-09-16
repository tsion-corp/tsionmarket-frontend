---
date: 2026-09-13
feature: The ArkStore ticket opens the store's own domain
scope: portfolio
scenario-impact: none
---

# The ArkStore ticket opens the store's own domain

## What changed

"Get Our App · On ArkStore" on the home's promo deck opened the store's Vercel
preview, `ark-store-beta.vercel.app`. It now opens `https://www.arkstore.xyz/apps/ark`,
the store's real address, as the maintainers asked.

## Why

The preview address was a placeholder from before the store had its domain.

## How it was verified

A test pins the address (`lib/brand.test.ts`), written red against the old
value first. The ticket itself is unchanged; it reads the one constant.

## Scenario impact

None: no flow changes, only the destination of one outbound link.
