---
date: 2026-10-27
branch: chore/hide-kash-buy
base: main
scenario-impact: none
---

# Kash cards no longer offer Buy

The Buy button is gone from the Kash card on desktop and mobile, by the team's
call. Send and Convert stay; on a phone the row resizes to the buttons it has.

The switch is `KASH_BUY_ENABLED` in `features/portfolio/lib/kash-buy.ts`. The
buy modal and its handlers stay wired, so turning it back on is one line.

The Kash promo banner's own Buy call to action is unchanged.

Tests: both card test files cover the switch off (no Buy button, mobile row in
two columns, or one when Send is also off) and keep the existing cases with it on.
