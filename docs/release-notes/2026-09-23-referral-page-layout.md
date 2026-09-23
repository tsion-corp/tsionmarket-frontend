---
date: 2026-09-23
feature: The referral page uses the page it was given
scope: fix
scenario-impact: none
---

# The referral page was still a sheet in the middle of a screen

`/referrals` shipped as a route in #551, but its contents were unchanged from
the modal they had been: a 520px column, centre-aligned, everything in one
stack. On a desktop that left most of the screen empty and pushed the network
below three scrolls of reference text. Nothing was wrong with the pieces; they
were arranged for a sheet.

Same content, restructured. Nothing was dropped.

## What moved

**The hero carries the action.** Mascots on the left, and on the right the
headline, the sub, the invite link with Copy, the Share button, and the
progress bar. Those four things are one thought — who this is for, the link,
sharing it, how far along you are — and they were spread from the top of the
page to the bottom of the scroll. Share was the last element on the page; it is
beside the link it shares now.

**A stat strip.** Referrals, Deposit Pending, In your network, Counted. None of
these figures are new: the first two came from the progress card, the second
two from inside the network panel, where they sat three scrolls apart. The
network pair appears only once there is a network.

**Two columns from `lg` up.** The lists — who joined, and the network by
generation — take the wide column, since they are the only part of the page
long enough to scroll. The two rules, eligibility and how it works, go in a
rail that sticks while you read.

## On a phone

One column, and the reading order is the one the sheet had: hero, the figures,
the rules, then the lists. The rail is first in the document and moved to the
right-hand column only at `lg`, so nothing depends on a media query to read
correctly.

The link row and Share stack at full width below `sm` and sit on one line above
it. The stat tiles are two across on a phone rather than four, which would have
made each one too narrow to read at 360px.

## Not changed

The claim step keeps its own narrow measure: it is a single form, and a form
stretched across 1100px is harder to fill, not easier. Every string, count,
tab, toggle and generation row behaves exactly as before.
