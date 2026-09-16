---
date: 2026-09-16
feature: The memecoin screener enforces its own filters
scope: trade
scenario-impact: none
---

# The memecoin screener enforces its own filters

Added to #501 before merging.

## What was wrong

The screener sends its bounds and sort to the trade service and did no
filtering of its own. The service accepts every one of those parameters and, as
of 2026-09-16, acts on none of them. Measured against production:

```
GET /tokens?page=1&limit=5                        → $HACHIKO, MENTE, cbBTC, BTCB, APEC
GET /tokens?page=1&limit=5&maxMarketCapUsd=1000   → identical, cbBTC at $3,491,589,227
GET /tokens?page=1&limit=5&sortBy=volume&sortOrder=desc
                                                  → 36,641 · 96,690 · 271,492,284 · 1,235
```

`total` stayed at 138,249 for every query. The gateway forwards the parameters
(`page` and `limit` work), so the screener path is simply not deployed.

The result on screen: "Filters ②" reads as applied over an unfiltered list, and
a $1M market-cap filter shows a $3.5bn coin. The PR's own ADR names this hazard
in advance — "the app must never send a value it has not validated itself, or
the table would silently show an unfiltered list."

## What changed

`applyScreener` in `lib/meme/screener.ts`: bounds, then the sort, over whatever
the service returned. The query is still sent, so the work stops happening here
the moment the service honours it, and the paging stays right.

Applying the same predicate to an already-filtered list is idempotent, so this
is correct before and after that deploy with no feature detection to get wrong.
A test asserts it.

Two rules the contract insists on, and this follows:

- **A metric the service could not report is not a match.** Asked for a market
  cap under a million, a coin whose market cap is unknown has not been shown to
  qualify. `null` means "not currently available", never zero; counting it as 0
  would slip every unpriced coin into every "under" filter.
- **Unreadable values sort last in both directions.** A coin the service cannot
  measure is not the smallest one, and ascending order must not open with a wall
  of unknowns.

Comparison is `compareDecimal`, the exact digit-by-digit comparison the rest of
the screener uses, so "9" is not more than "10" and no float rounding enters.

## How it was verified

Eleven tests in `lib/meme/screener.test.ts`, including the production case
above: a list holding APEC at $25,564 and cbBTC at $3,491,589,227 under a $1M
cap keeps APEC alone.

Full `./scripts/preflight.sh` clean: 5,085 tests. `/meme` stays at 1592 kB
against its 1660 budget.
