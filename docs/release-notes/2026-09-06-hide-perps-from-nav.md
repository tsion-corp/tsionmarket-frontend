---
scenario-impact: updated
---

# Release Note: Perpetuals hidden from the navigation

## Summary

Perpetuals are no longer offered from the navigation, the same way Earn is
hidden today: not in the sidebar rail, the phone tab bar, the feature marquee
or the dashboard briefs. The desk itself stays at `/perps` and works as before
for anyone who has the link. The onboarding interest "perps" falls back to the
default section order.

## What changed

- `lib/sections.ts`: `"perps"` commented out of the reorderable nav sections
  and of the interest-to-section map, with the same note style as Earn. Every
  surface that lists sections derives from that order, so nothing else changed.

## Verification

- Red then green in `lib/sections.test.ts`: perps absent from the default
  order and from the "perps" interest order; the "perps" interest yields the
  default order.
- `./scripts/preflight.sh` in full.

## Scenario impact

`updated`: the rail loses the Perpetuals entry and the dashboard loses its
perps brief; the `/perps` route is unchanged. Reversal is uncommenting the two
lines.
