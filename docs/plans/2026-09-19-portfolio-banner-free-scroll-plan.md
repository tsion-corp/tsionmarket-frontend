# Plan: the portfolio banners move on their own and scroll with a trackpad

ADR: `docs/adr/ADR-2026-09-19-portfolio-banner-free-scroll.md`, approved
2026-09-19.

Branch: `feat/portfolio-banner-free-scroll`, cut from `origin/staging`
(`febdd487`). Web push was scoped out of this branch: platform-wide push needs a
backend notification hub, which the backend team is building first.

## Ground rules

- Layers point down: `app/` → `features/` → `components/ui/`, `hooks/` → `lib/`.
- Test first. Red, then green. No `any`, no `@ts-ignore`, no empty catch.
- New strings in all five catalogues (`carousel.pause`, `carousel.play`).
- Comments: plain English, why rather than what, no em-dashes.

## Files

`components/ui/carousel.tsx` and its test, `components/ui/promo-rail.tsx` and a
new `promo-rail.test.tsx`, and the two `carousel` strings in `messages/*.json`.

## The change

### `Carousel` gains one prop and a wheel listener

```ts
interface CarouselProps {
  // …existing props unchanged
  /** "hover" (default) pauses the advance while the pointer rests on the
   *  carousel. "persist" keeps advancing and pauses only on the gates below. */
  autoAdvance?: "hover" | "persist";
}
export const WHEEL_STEP_PX = 40; // accumulated delta that makes one step
export const WHEEL_COOLDOWN_MS = 320; // one flick is one step, not twelve
export const INTERACTION_PAUSE_MS = 8000;
```

**Wheel.** A `wheel` listener on the viewport node, registered in an effect with
`{ passive: false }` so it may `preventDefault`:

- Horizontal intent only: `Math.abs(deltaX) > Math.abs(deltaY)`, or `shiftKey`
  with a vertical delta. Otherwise return, having prevented nothing.
- Signed delta accumulates; at `WHEEL_STEP_PX` it calls `scrollNext`/`scrollPrev`
  and resets, then ignores further deltas for `WHEEL_COOLDOWN_MS`.
- `preventDefault` **only** when `emblaApi.canScrollNext()` / `canScrollPrev()`
  is true for the direction asked for. At the end of a non-looping carousel the
  page scrolls instead: a rail must never trap the reader.
- Normalise `deltaMode` (1 = lines, 2 = pages) to pixels before accumulating.

**Advance gates.** The timer runs only when every one of these holds:
`loop`, `intervalMs > 0`, not reduced motion, not paused by the control, no
focus inside, the tab visible, the section intersecting, and no interaction in
the last `INTERACTION_PAUSE_MS`. Under `"hover"` a resting pointer also pauses
it (today's behaviour, unchanged for the discovery shelves).

**Pause control.** Rendered beside the dots only when the carousel actually
advances (`autoAdvance === "persist"` and `intervalMs > 0` and `loop`). A
`button` with `aria-pressed`, labelled `carousel.pause` / `carousel.play`, using
the dots' hit-area conventions. Its state persists for the session under
`sessionStorage["ws.carousel.paused"]`, read after mount so the server and the
first client frame agree.

`PromoRail` passes `autoAdvance="persist"`. Nothing else changes.
