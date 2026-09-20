# ADR for Dummies: the portfolio banners move on their own

**Status:** approved on 2026-09-19.

The technical version is `ADR-2026-09-19-portfolio-banner-free-scroll.md`.

## What's the problem?

On the desktop portfolio screen there's a row of banners at the top (ArkStore,
Set the stake, Kash, Square) and several rows of cards below it. Right now the
only way to move any of them is to click and drag. A two-finger swipe on a
trackpad does nothing at all.

They are supposed to advance by themselves every 10 seconds, and technically
they do — but they stop the moment your mouse pointer is anywhere over them. On
a desktop your pointer usually sits in the middle of the screen, which is
exactly where the banners are. So in practice they sit still.

## What are we going to do?

Two things, which together are what "scroll freely" means here.

**1. A trackpad and mouse wheel will move them.** Swipe sideways with two
fingers, or hold Shift and scroll, and the banners move. Scrolling up and down
still scrolls the page as normal — the banners never hijack it. At the end of a
row, your scroll passes through to the page instead of getting stuck.

**2. The top banner row keeps moving while your pointer is over it.** It still
stops when:

- you're tabbing through it with a keyboard;
- the browser tab isn't the one you're looking at;
- the row has scrolled off screen;
- you've just dragged or scrolled it (it waits 8 seconds before moving again);
- the device is set to reduce motion.

The rows of cards below keep today's behaviour and still pause on hover. Only
the top banner row changes, and only on desktop. Phones are untouched.

## Why add a pause button?

Accessibility rules say anything that moves on its own for more than five
seconds needs a way to stop it. Today, hovering is that way. Since hovering will
no longer stop it, the banner row gets a small pause button next to its dots.
If you press it, the row stays stopped for the rest of your session.

## What could go wrong?

- Something moving under your pointer can feel busy. That's why any interaction
  pauses it for 8 seconds, and why the pause button exists.
- The trackpad handling is the fiddly part — different mice and trackpads send
  very different signals. The sensitivity is set in one place so it's easy to
  adjust if it feels wrong on your hardware.
