---
date: 2026-09-23
feature: Last Man leaving prompt on every route, mobile layout, and the store button on the landing page
scope: fix
scenario-impact: none
---

# Leaving a live round always asks first, and the phone layout stops fighting itself

The keep-watching prompt only caught the browser's back button and links. The
phone's tab bar navigates with a router call, so tapping Arkade or Portfolio
during a live round walked straight out of the game without asking.

- A screen can now register a navigation guard, and every place that navigates
  without a link asks it first. The tab bar is the one that needed it; the
  sidebar and the header were already covered because they use links.
- The pop-out timer button is gone. It was a manual way to open what navigating
  away now offers on its own, and it sat in the layout doing nothing else. The
  pop-out overlay itself is unchanged.
- On a phone, the add liquidity input and its button stack one above the other
  instead of squeezing side by side.
- On a phone, the invite card now sits below add liquidity rather than above it,
  so the controls a player came for are the ones in reach.
- The landing page carries a Get App button beside Get started, pointing at the
  ArkStore listing.
