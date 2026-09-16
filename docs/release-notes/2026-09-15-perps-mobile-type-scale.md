---
date: 2026-09-15
feature: The perps desk drops a type step on phones
scope: trade
scenario-impact: none
---

# The perps desk drops a type step on phones

## What was wrong

The perps desk was typeset for the two-column layout it draws from 1080px up.
On a phone the same desk stacks into one narrow column, and the sizes that read
comfortably across two columns crowd the cards: the order ticket's amount field
alone was set at 31px, the pair strip, the price card and the quantity labels
all at 15px, with no smaller step anywhere below `sm`.

Removing the desk's second side gutter (#491) gave the cards back 32px of
width. This is the other half of the same complaint: the type itself.

## What changed

Every fixed size on the two perps-only surfaces now has a phone step under an
`sm:` restore, so nothing moves from 640px up.

| element                        | phone   | 640px and up |
| ------------------------------ | ------- | ------------ |
| order ticket amount field      | 26px    | 31px         |
| price card label, value, quote | 13px    | 15px         |
| quantity label, asset pill     | 13px    | 15px         |
| balance line                   | 12px    | 14px         |
| 24h change, summary rows       | 13px    | 15px         |
| take-profit / stop-loss fields | 12–13px | 13–15px      |
| asset picker pair name         | 14px    | 16px         |
| asset picker mark price        | 16px    | 19px         |

Both files are perps-only. `SpotTokenBadge` and `SpotOrderModeToggle` sit on
the same strip but are shared with the spot desk, so they are untouched: a
perps complaint is not a reason to resize spot. The Buy and Sell buttons keep
their 16px, because shrinking the primary action is the opposite of what the
change is for.

## How it was verified

Three tests in `features/trade/components/perp-order-ticket.test.tsx` assert
the two-step scale on the amount field, the quantity card's labels and the
price field. jsdom has no layout, so the class list is the only place a
breakpoint is visible; each was confirmed to fail against the old single size
before the change went in.

Full `./scripts/preflight.sh` clean.
