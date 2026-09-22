---
date: 2026-09-22
feature: Arkjet live activity rail
scope: feature
scenario-impact: none
---

# Arkjet activity follows each flight live

The Arkjet All tab now shows the current round's ticket activity instead of a
second copy of round history.

- Profiles appear as the backend reveals them during the betting window.
- Cash-outs update through the Arkjet WebSocket and show their multiplier and
  payout immediately.
- A coalesced snapshot repair keeps the feed synchronized after reconnects or
  missed events without creating a polling burst.
- Previous and Top continue to show provably fair completed-round results.
