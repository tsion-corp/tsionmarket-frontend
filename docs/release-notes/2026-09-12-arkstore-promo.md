---
date: 2026-09-12
feature: An ArkStore ticket opens the promo deck
scope: portfolio
scenario-impact: updated
---

# An ArkStore ticket opens the promo deck

## What changed

The home's promo deck carried three tickets: the casino's "Set the stake",
"Get Kash+" and the Market Square banner. A fourth now leads it, for the app
itself: **Get our app | on ArkStore**. Opening it opens the store in a new tab.

**The deck is no longer phone-only.** It was inside the phone head, so at
768px and up the whole strip disappeared. It now sits under the balance cards
at every width: one ticket at a time on a phone, two from 768px and three from
1280px, so each stays near the size it is drawn at instead of being scaled up
into a band.

## The design

It is the deck's own ticket: the same artboard, the same scalloped edges, the
same pitch, hairline and tagline rhythm, so it sits in the row as a member of
the set rather than a guest.

What makes it its own:

- **Ink and white, not a fourth colour.** The three beside it are the casino's
  red, Kash's gold and the square's purple. This one is the app, so it wears
  the brand's own ink, lit from the left, with a star field and a hairline of
  light along its top edge.
- **The motif is what is on offer:** a phone showing a home screen of four
  tiles with the Ark tile lit, and the download badge that puts it there. Drawn
  in CSS, so it ships no artwork and stays sharp at any width.
- **The edges are masks, not images.** The deck's edge export is the casino's
  red, so it is used as a mask and each stub is painted the colour the body
  reaches at that end. The ticket reads as one piece instead of three.

Like the casino ticket, the banner is presentational: the link belongs to the
page that places it.

## The store's address

The ticket opens `https://ark-store-beta.vercel.app/apps/ark`, the Ark app's
page on ArkStore. `ARKSTORE_URL` in `lib/brand.ts` is the one place it lives,
so the beta address is a single edit when the store moves.

## Tests

`features/portfolio/components/ark-store-banner.test.tsx`: the words come from
the catalogue, the banner offers no control and no art to the accessibility
tree, and the artboard scales to the width it is given.
