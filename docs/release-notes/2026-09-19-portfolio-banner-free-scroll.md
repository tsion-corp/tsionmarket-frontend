---
date: 2026-09-19
feature: The portfolio banners move on their own and scroll with a trackpad
scope: ui/carousel
scenario-impact: updated
adr: docs/adr/ADR-2026-09-19-portfolio-banner-free-scroll.md
plan: docs/plans/2026-09-19-portfolio-banner-free-scroll-plan.md
---

# The portfolio banners move on their own and scroll with a trackpad

## What changed

On the desktop portfolio screen the promo rail (ArkStore, Set the stake, Kash,
Square) could only be moved by pressing and dragging it, and although it was
meant to advance every ten seconds it almost never did.

- **A trackpad or wheel now moves any carousel in the app.** A two-finger
  horizontal swipe, or Shift with a wheel, steps it. Vertical scrolling is left
  alone and still scrolls the page. At the end of a carousel that does not loop,
  the gesture passes through to the page rather than being trapped.
- **The promo rail keeps advancing while the pointer rests on it.** It still
  stops for keyboard focus inside it, a hidden tab, being scrolled off screen,
  eight seconds after any drag, wheel or dot tap, and reduced motion.
- **The rail has a pause control** beside its dots, because hovering no longer
  stops it and WCAG 2.2.2 requires a way to stop content that moves on its own.
  The choice is remembered for the browser session.
- **The live region follows what the rail is actually doing**: silent while it
  advances by itself, announcing once it has stopped. Before this, a resting
  pointer switched it to "announce" while the rail kept moving.

## Why the rail looked frozen

Two independent causes, both now fixed:

1. Embla binds pointer and touch drag only. It ships no wheel handling, and the
   viewport is `overflow-hidden` over a transform-driven track, so there was
   nothing for a trackpad to scroll.
2. The ten-second timer paused on `mouseenter` over the whole section. On a
   desktop the pointer usually rests in the middle of the page, which is where
   the rail is.

## Scope

`autoAdvance` defaults to `"hover"`, so the six discovery shelves behave exactly
as before, and no focus, visibility or intersection listener is even constructed
for them. Only `PromoRail` opts into `"persist"`, and it is `hidden md:block`,
so this is desktop-only by construction. The phone deck and balance carousel are
untouched.

Unchanged: slide measurement, the negative-margin spacing Embla measures by,
the container queries, the dots, keyboard handling.

## Tuning

`WHEEL_STEP_PX` (40), `WHEEL_COOLDOWN_MS` (320) and `INTERACTION_PAUSE_MS`
(8000) are exported from `components/ui/carousel.tsx`. Trackpad and wheel
hardware varies, and these were chosen on paper; they are in one place so they
can be retuned against real hardware.

One known sharp edge: intent is decided by `|deltaX| > |deltaY|`, so a mostly
vertical swipe with a horizontal drift is taken by the rail and briefly blocks
page scroll. A dead zone (`|deltaX| > |deltaY| * 1.5`) is the one-line change if
that turns out to be annoying in use.

## Scenario impact

`updated`. A scenario that drags a portfolio banner can now scroll it instead. A
scenario that measures the rail while the pointer is over it will find it moving.

## Tests

`carousel.test.tsx` keeps all twelve existing tests unedited and adds twenty:
wheel stepping and its cooldown, vertical and end-of-carousel pass-through,
`deltaMode` normalisation, persist versus hover, each pause gate, the pause
control and its session memory, and the live region. New `promo-rail.test.tsx`
covers the rail opting in. The red phase was verified by running the new tests
against the previous files.
