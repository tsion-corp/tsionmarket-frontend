# ADR-2026-09-19: the portfolio banners move on their own and scroll with a trackpad

## Status

Approved by the maintainer on 2026-09-19, on the answer that "scroll freely"
means both halves: the banners advance on their own, and a trackpad or wheel
also moves them.

## Context

The maintainer, on the desktop portfolio screen: "I want each section banner to
be scrolling freely. So it shouldn't scroll only when the user pinch, pinch it.
So it should just scroll freely, not until they pinch and scroll." Asked which
half was meant, they answered **both**: the banners should advance by
themselves, and a trackpad or wheel should also move them.

`/portfolio` renders `DashboardPage`, so "each section banner" covers the
dashboard's strips. Two kinds exist:

| Strip                                                     | Component                                              | Where                                                         |
| --------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| The promo rail (ArkStore, Set the stake, Kash, Square)    | `components/ui/promo-rail.tsx` → `Carousel`            | `portfolio-view.tsx:398`, `hidden md:block`                   |
| Six discovery shelves (Token Moves, Arkade, Next 100X, …) | `features/discovery/components/*-row.tsx` → `Carousel` | `dashboard-page.tsx:373-389` (desktop) and `:330-366` (phone) |

Both run on `components/ui/carousel.tsx`, which uses Embla:

```ts
const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: false, loop });
```

Measured against the complaint, two things are true today:

1. **A trackpad does nothing.** Embla 8 binds pointer and touch drag only; it
   ships no wheel handling, and the viewport is `overflow-hidden` with a
   transform-driven track, so there is no native scrolling to fall back on. The
   only way to move a rail is to press and drag, which is the "pinch" in the
   report.
2. **It does auto-advance, but almost never on a desktop.** There is a 10s
   timer (`carousel.tsx:164-170`), gated on four conditions, one of which is
   `paused`, set by `onMouseEnter` and `onFocus` **on the whole section**
   (`:202-205`). On a desktop the pointer rests over the middle of the page, so
   the rail under it sits still for as long as the reader is looking at it.

The repo already contains the pattern the maintainer is describing, in
`features/square/components/promo-shell.tsx:51`: a native scroll-snap strip,
with the comment "so a trackpad, a swipe, shift-wheel and the keyboard all
work".

## Decision

Change `components/ui/carousel.tsx`, keeping Embla, and opt the promo rail into
the new behaviour. Three parts.

### 1. A trackpad and a wheel scroll the rail

The carousel listens for `wheel` on its viewport and turns **horizontal
intent** into `scrollNext`/`scrollPrev`:

- Horizontal intent is `Math.abs(deltaX) > Math.abs(deltaY)` (a two-finger
  trackpad swipe) or a wheel with `shiftKey` (the mouse convention). Vertical
  intent is ignored and the page scrolls as it does today.
- `preventDefault` is called **only** when the carousel can actually move in the
  direction asked for. At either end of a non-looping carousel the gesture
  passes through to the page, so a rail can never trap the reader's scroll.
  This is why the listener is registered with `{ passive: false }` through a
  ref effect rather than React's `onWheel`, which is passive.
- Deltas are accumulated and a step fires when the total passes a threshold
  (~40px), then resets, with a short cooldown (~320ms) so one flick moves one
  slide rather than twelve. Trackpad momentum sends dozens of small events; the
  threshold plus cooldown is what makes it feel like paging.

This lands for every carousel, the discovery shelves included. It adds no
dependency: `embla-carousel-wheel-gestures` was considered and rejected below.

### 2. The promo rail keeps moving while the pointer is over it

`Carousel` gains one prop:

```ts
/** "hover" pauses the advance while the pointer rests on the carousel (the
 *  default, unchanged). "persist" keeps advancing under a resting pointer and
 *  pauses only on the gates below. */
autoAdvance?: "hover" | "persist";
```

`PromoRail` passes `autoAdvance="persist"`. Everything else keeps `"hover"`, so
the discovery shelves behave exactly as they do now.

Under `"persist"` the timer still stops for:

- **reduced motion** (unchanged);
- **keyboard focus inside the rail** (`focusin`/`focusout`), so a reader
  tabbing through the banners is never moved out from under;
- **a hidden tab** (`document.visibilitychange`), so a background tab does not
  spin a timer;
- **the rail being off screen** (`IntersectionObserver`), for the same reason;
- **recent interaction**: a drag, a wheel step or a dot tap pauses the advance
  for 8 seconds, so the rail does not yank itself away from someone reading it.

### 3. A pause control, because the movement is now unstoppable by hovering

WCAG 2.2.2 (Pause, Stop, Hide) requires a mechanism to pause content that moves
automatically for more than five seconds. Today the hover pause is that
mechanism; `"persist"` removes it, so the rail grows an explicit control beside
its dots: a small pause/play button, labelled from the `carousel` namespace,
that stops the advance until pressed again. Its state is remembered for the
session (`sessionStorage`), so a reader who stops the rail does not have to stop
it again on the next page.

```
┌───────────────── promo rail ─────────────────┐
│  [ ArkStore ticket ]   [ Set the stake ]      │  ← wheel / trackpad scrolls
│                                               │  ← advances every 10s
│                ● ─ ─ ─          ⏸             │  ← dots, then pause/play
└───────────────────────────────────────────────┘
```

## What is not changed

- The phone: `PromoCarousel` (`promo-deck.tsx`) and `BalanceCarousel` keep
  their current behaviour, and a wheel does not exist on touch. `promo-rail` is
  `hidden md:block`, so the persist behaviour is desktop-only by construction.
- The slide measurement, the negative-margin spacing Embla needs, the container
  queries, the dots, the keyboard handling and the `aria-live` rules.
- The discovery shelves' pause-on-hover.
- `explore-banners`, `promo-shell` and `square-live-strip`, which are already
  native scrollers.

## Consequences

**Positive**

- The rail behaves the way a reader expects: it moves on its own, and a
  trackpad flick moves it now rather than requiring a press and drag.
- Every carousel in the app gains trackpad scrolling, with the page's own
  scrolling untouched.

**Negative and risks**

- Movement under a resting pointer can be read as busy. The pause control, the
  8s interaction pause and the reduced-motion gate are the mitigations.
- A hand-rolled wheel handler is the only part of this that can misbehave on
  hardware we cannot test here (free-spinning wheels, Magic Mouse inertia). The
  threshold and cooldown are constants in one place so they can be tuned.
- `preventDefault` on a non-passive listener is a scroll-performance cost on
  the rail only, and only for horizontal gestures.

## Alternatives considered

- **`dragFree: true`.** One line, but it only changes drag momentum. A trackpad
  still does nothing, so it does not answer the request.
- **`embla-carousel-wheel-gestures`.** A dependency for about 40 lines, and it
  takes over both axes by default, which risks trapping page scroll. Rejected.
- **Replace the viewport with a native `overflow-x-auto` scroller** (the
  `promo-shell` pattern). Free trackpad, wheel and keyboard scrolling, but it
  drops Embla's loop and the dot pager's `scrollTo`, changes the spacing model
  the container queries are built on, and breaks
  `carousel.test.tsx:171`. Too much blast radius for six shelves and one rail.
- **A CSS marquee** (`ws-marquee`). Continuous movement, no pagination, no dots,
  and it cannot be dragged. Wrong shape for banners that are links.

## Test plan

`components/ui/carousel.test.tsx` keeps every existing test, and gains:

- a horizontal wheel steps the carousel once, not many times, and a second
  step needs the cooldown to pass;
- a vertical wheel does nothing and is not `preventDefault`ed;
- `shift` plus a vertical wheel steps it;
- at the end of a non-looping carousel the event is not `preventDefault`ed;
- `autoAdvance="persist"` keeps advancing with the pointer over the section,
  while `"hover"` (default) still pauses, so the shelves are provably unchanged;
- focus inside, a hidden tab, and an off-screen rail each stop the advance;
- a wheel step or a dot tap pauses the advance for 8s;
- the pause control stops and resumes it, and its state survives a remount;
- reduced motion still never advances.

A new `components/ui/promo-rail.test.tsx` checks the rail opts into `persist`
and renders the pause control. `./scripts/preflight.sh` and a manual pass on the
dev server with a trackpad, a wheel and a keyboard.
