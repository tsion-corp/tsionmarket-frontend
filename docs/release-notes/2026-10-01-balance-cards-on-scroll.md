---
date: 2026-10-01
feature: The phone's balance cards turn over as you scroll, and the Ark ID page leads with identity
scope: feature
scenario-impact: updated
---

# Both balances, without knowing about the swipe

The phone portfolio's two cards — the main balance and Kash — used to be
reachable only by swiping sideways. A swipe is a gesture a reader has to already
know is there, and most never find it. The product ask was that scrolling should
reveal both.

It now does: the card turns over to Kash as you begin scrolling down, and back to
the balance on the way up. **The swipe still works, the indicator is unchanged,
and the desktop grid is untouched** — it shows both cards side by side already,
so it has nothing to reveal.

## Three attempts, and why the third is the shape it is

Worth recording, because each failure ruled something out and the final design is
only defensible against that history.

**A pin.** The literal reading of "the page pauses while the card slides":
`position: sticky` plus a runway of empty scroll to be held through. It worked.
It also put a band of empty space between the cards and the promo strip, because
holding the page means adding scroll distance, adding scroll distance means
adding page height, and that height has to be somewhere.

That is not a bug in the implementation, it is what a pin costs. The only way to
hide it is for the pinned block to fill the viewport, which these cards are not
meant to do; the alternative is letting the following content slide up behind the
cards, which trades a gap for the promo strip being eaten. Neither was worth it.

**A rect-measured reveal over a fifth of the viewport.** The pin came out and the
reveal was measured from the moment the block passed under the header. Too late
and too slow: the block is about 200px tall and sits ~110px down the page, so it
starts disappearing after ~46px of scroll, while the reveal wanted ~150px. The
card turned over with half the block already gone, and the Kash balance arrived
too far up the screen to read — which is the entire point of showing it.

**The reveal that shipped.** Measured in PAGE scroll against the block's document
offset, beginning at the first pixel, and over in twelve to twenty-four pixels.
The requirement was "across before down"; a true hold could not be had without
paying in layout, so the ordering is bought with speed instead. The swap fires on
the first movement of any real gesture, before the page has travelled far enough
to read as having moved.

## The bug that survived two of those attempts

`revealProgress` changed shape from `(elementTop, headerOffset, distance)` to
`(scrollY, start, distance)`. Both are three numbers. The compiler was content
while the component handed it an element's viewport top where a page offset
belonged — and a viewport top DECREASES as the reader scrolls down, so the whole
mapping ran backwards and the card sat still.

Every pure test passed throughout. They were testing arithmetic that was correct.

The honest cause is a process one: an edit was applied with a string replace that
was not asserted, so when the target did not match it changed nothing and
reported success. Prettier printed "unchanged" and that signal was read past.

`features/portfolio/components/balance-reveal.test.tsx` is the answer. jsdom does
not scroll, so it stubs `scrollY` and has the block report a rect derived from
it — the same relationship a real element has. Reinstating either bug fails it:
the backwards mapping fails five cases, the late start fails five.

Nothing here is provable by a pure function. That file should have existed first.

## Shape

- `lib/portfolio/balance-reveal.ts` — the mapping, pure, testable without a DOM,
  in the mould of `lib/landing/journey.ts`.
- `features/portfolio/components/balance-reveal.tsx` — a `requestAnimationFrame`
  loop on a dirty flag, matching `hooks/use-scroll-journey.ts`. Only the card
  index reaches React, at most twice per pass. It renders a bare `<div>`: no
  sticky, no spacer, **no height added and no layout moved**.
- `BalanceCarousel` gained an optional `card` prop. It moves when that CHANGES,
  not while it merely differs — otherwise a reader who swipes back is dragged
  forward again on the next scroll frame, with no way to disagree.

One real fragility surfaced while testing: `frame = requestAnimationFrame(read)`
assigns the handle after the callback has run if frames are synchronous, which
clobbers the zero `read` wrote and latches the guard shut. Browsers are async so
it would not have bitten in production. It is a separate `scheduled` flag now,
cleared by the callback itself.

Under reduced motion none of this runs, per the rule in `globals.css` that
nothing may translate. The carousel is left as the plain swipe carousel it was.

## The Ark ID page leads with identity

`bns.modalTitle` was "Claim your {brand} ID" and is now "Secure YOUR identity in
the new Economy." — the maintainer's own words, with the emphasis the capitalised
YOUR carries kept in all five catalogues.

The `{brand}` placeholder went with it, since the new line does not name the
brand, and the argument the call site was passing went too rather than being left
to feed nothing.

## Still to check

**None of this has been seen in a browser by the person who wrote it.** The
reveal's timing is a feel judgement no test can make: it is currently tuned to
fire almost immediately, and "almost immediately" is exactly the kind of number
that is either right or obviously wrong the moment a thumb touches it.

**The Ark ID subtitle was left alone.** It still reads "One name, always yours —
send and receive Kash today, and your money tomorrow.", which is pitched at
naming while the new heading is pitched at identity. They may now be arguing.
