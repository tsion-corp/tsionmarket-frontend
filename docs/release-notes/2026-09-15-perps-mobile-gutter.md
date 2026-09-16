---
date: 2026-09-15
feature: The phone perps desk stops paying for two side gutters
scope: trade
scenario-impact: none
---

# The phone perps desk stops paying for two side gutters

## What was wrong

On a phone, the Market view's Leverage tab spent 36px a side on gutters before
the desk's own panels had drawn anything:

| layer                             | horizontal padding |
| --------------------------------- | ------------------ |
| the Market view's scroller        | `px-5` — 20px      |
| `PerpsSection`, mounted inside it | `p-4` — 16px       |
| the desk's order panel            | `px-[11px]` — 11px |

That is 94px of a 390px screen gone to chrome. The order ticket's Limit/Market
toggle was clipped off the right edge, and every card read as cramped.

`PerpsSection` draws its own gutter because `/perps` is a page that is only
this desk. Inside the Market view it is not the page, and the second gutter was
paid on top of the first.

## What changed

`PerpsSection` takes a `gutter` prop, true by default, so `/perps` is exactly
as it was. The Market view mounts it with `gutter={false}`, because the
scroller around it already provides the side gutter.

That returns 32px of width to the desk on a phone. Vertical padding is
unchanged in both cases, and nothing moves from `sm` up.

## What was deliberately left alone

The Market view's own `px-5` and the desk's `px-[11px]` panel padding. The
first is the page gutter every tab shares, and changing it moves Spot,
Memecoins and Real assets for a complaint about Leverage; the second is a
card's inside edge, and trimming it puts text against the border. The redundant
layer was the one worth removing.

## Tests

- `perps-section.test.tsx` (new): the gutter is drawn by default, dropped when
  the page provides one, and the vertical padding survives either way.
