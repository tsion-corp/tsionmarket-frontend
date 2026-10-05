---
date: 2026-10-05
feature: Arkjet's multiplier climbs smoothly and the aircraft art is refreshed
scope: fix
scenario-impact: none
---

# Arkjet: smooth flight display

Ported from staging (#616).

- **Smooth multiplier.** While a round runs, the displayed multiplier climbs
  every animation frame from the last server value, instead of jumping each
  time a socket or poll update arrives. It never drops below what the server
  last reported, and settles on the exact value when the round ends.
- **Faster recovery.** Without a live socket the round is polled every second
  instead of every five, and a stalled running round is re-read once its
  updates stop for a second and a half.
- **Default stake.** The bet card opens at 1 USDC, or the game's minimum when
  that is higher.
- **Aircraft art.** The four plane frames are redrawn.
