---
date: 2026-09-29
feature: Hermetic fonts, straight rail banners, typed-only stake, Ark ID label rule, and four copy and layout fixes
scope: fix
scenario-impact: none
---

# Six polish fixes and a CI fix, one pull request

## Fonts are files now, so the build is hermetic

The `build` job failed on `main` twice this week on commits that had built
green on their PR, once on Roboto and once on Manrope. `next/font/google`
fetches each face from Google at build time, and Turbopack falls over when
the answer comes back in a shape it does not expect
(vercel/next.js#99114). Every face the app uses (Geist, Noto Sans, Roboto,
Quicksand, Manrope, and Mona Sans as before) is now a latin-subset variable
woff2 under `app/fonts/`, loaded with `next/font/local`. A test asserts the
layout imports nothing from `next/font/google` and that every declared file
exists. Licences in `app/fonts/LICENSES.md`.

## Promo rail: straight edges

Every banner on the promo rail and the phone's promo deck was cut like a
ticket, with a column of bumps at each end. The product owner asked for
straight edges. All five banners (ArkStore, Ark ID, Set the stake, Kash,
Market Square) now run their fill to the card with a 10px corner, and the
stub artwork is deleted. The art inside each banner keeps the box it was
measured against, so nothing inside moved; only the Kash banner's export,
which was drawn to the old fill, is stretched by one part in seventy to reach
the edges.

## Ark ID search takes letters and digits

Checked against the BNS service: its `nameSchema` is the registrar's own rule
(three characters or more, no dot, no whitespace, nothing a URL misreads) and
is deliberately not limited to ASCII letters and digits. The frontend mirrors
it exactly, so `alice1`, `2fast` and `ALICE9` were already accepted. One gap
was real: the search field parsed the label as a Kash recipient, which turns a
bare `0x` away as a pasted address, so `0xazach` (the service's own example
name) could not be searched. The page now parses a label (`parseArkLabel`),
and the send form keeps the recipient rule.

## Kash send: "isn't owned by anyone. Buy now"

An unresolvable Ark ID on the send form now reads `{name} isn't owned by
anyone.` with a `Buy now` link, in all five locales.

## Last Man: "Runs on / Blockchain"

The third fact card under How it works said "Base, paid in USDC, we cover the
network fee". It now says "Blockchain" with "No one controls the game other
than the players." The value is a catalogue string (`howFactChainValue`).

## Kash card on a phone: pills that fit

The three action pills set their label at a fixed 15px, and on a narrow
carousel slide "Convert" ran past the card. The type is now a share of the
card's width with a floor and a cap, and a pill may shrink below its label.

## Last Man arena: no plus and minus

The play amount is typed, so the two round buttons that moved it by the
game's minimum are gone, together with their artwork and catalogue strings.
The field, its clamping to the minimum and the balance, and its tests stay.
