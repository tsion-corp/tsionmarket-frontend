---
date: 2026-09-15
feature: The perps ticket's top strip fits a phone
scope: trade
scenario-impact: none
---

# The perps ticket's top strip fits a phone

## What was wrong

#493 stepped the perps desk's type down at phone width but deliberately left
two pieces alone: `SpotTokenBadge`, the pill that names the market, and
`SpotOrderModeToggle`, the Limit/Market segmented control. They sit on the
ticket's top strip and were still drawn at desk size, so that one row still
overran its card at 390px and the Market segment was cut off at the screen
edge.

The reason for leaving them was that both live in the spot module. Checking
the consumers rather than the folder: `SpotOrderModeToggle` has exactly one
production caller, the perps ticket, because spot orders on that rail are
market orders and its strip carries no toggle at all. `TokenBadge` is drawn by
the perps ticket, the spot desktop ticket and the RWA ticket, and all three
crowd identically on a phone. There was no spot regression to protect.

## What changed

| element                      | phone    | 640px and up |
| ---------------------------- | -------- | ------------ |
| market pill type             | 13px     | 15px         |
| market pill height           | 34px     | 40.5px       |
| market pill side padding     | 9px      | 11px         |
| Limit/Market segment type    | 13px     | 15.5px       |
| Limit/Market segment padding | 12/5.5px | 18/6.75px    |

Sizing is most of the fix, but a row that can only ever fit beats one that
happens to. The strip now also states its priorities: the toggle never
shrinks, the pill never squashes, and the 24h change gives up its width first,
so no pair name or locale can push the toggle off the edge again.

## How it was verified

Red first, in both places: two tests in `spot-pair-header.test.tsx` for the
pill and segment scales, two in `perp-order-ticket.test.tsx` for the strip's
shrink priorities. Each was confirmed failing against the old markup before
the change went in. jsdom has no layout, so the class list is the only place a
breakpoint or a flex priority is visible.

Full `./scripts/preflight.sh` clean.
