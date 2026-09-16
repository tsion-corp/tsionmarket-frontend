---
date: 2026-09-12
feature: One promo strip per width again, with ArkStore on both
scope: portfolio
scenario-impact: updated
---

# One promo strip per width again, with ArkStore on both

## The defect

The desk showed two promo strips, one under the other: the phone's deck and
the desk's own rail, with the same tickets in both.

The home has carried two strips all along, each for its own width: the deck
the phone swipes, in the phone head, and the rail the Market design draws for
the desk, under the balance cards. Putting the ArkStore ticket on desktop was
done by taking the deck out of the phone head so it rendered at every width,
which left the desk with the deck **and** the rail.

## The fix

The deck is back inside the phone head, phone-only, and the desk's rail leads
with the ArkStore ticket, beside the ones it already carried. Both strips take
the same element, so the store has one link and one label in either place.

The deck's slides are full width again; they were split two and three up for
the desktop it no longer renders on.

## Verified

Rendered at 1400px: the rail leads with the ArkStore ticket, at the size its
neighbours are drawn at. The phone deck is unchanged, one ticket at a time,
ArkStore first.

There is no test: `portfolio-view.tsx` has no harness, and standing one up
means mocking the wallet, the Kash engine, the portfolio feed and the modal
host for a change that is composition only. The two strips are gated by
`md:hidden` and `hidden md:block` in one file, a few lines apart.
