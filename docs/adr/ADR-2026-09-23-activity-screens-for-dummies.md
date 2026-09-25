# ADR-2026-09-23 in plain English: rebuilding the Activity screen

## What we are building

A redesigned Activity screen, called Arkivity. There are four Figma frames, but
they are really **two screens, each drawn twice**: once for a desktop browser and
once for a phone.

**All Activity** is the history. Everything you have done, newest first, grouped
by day: "Today, 9th September, 5 activities". Each line says what happened
("Bought PEPE", "Withdrawal To Wallet", "ETH Price Prediction"), when, which part
of the product it belongs to, how it ended (Won, Lost, Processing, Completed),
and how much money moved.

**In Progress** is the things that have not finished yet. Not a list of lines but
a stack of cards, one per open thing, each showing what you staked, what you
stand to win, and a button to look closer or to cash out early.

## The one decision worth understanding

The screen looks like a list of recent events. Underneath, the app does not
currently have anything that resembles one.

What it has today is a list of **blockchain transactions**: a hash, a network, a
token, an amount, a direction. That is a perfectly good description of money
moving on a chain, and it is useless for this design. A transaction record has no
idea whether you won a prediction, whether a withdrawal is still processing, what
odds you took, or what you might be paid out. Those are product facts, not chain
facts.

You have told us new backend endpoints for balance and activity are coming after
this work. So we have a choice about what to build the screens on top of:

- **Build them on today's transaction shape.** The screens would work now, and
  then have to be pulled apart and rebuilt when the real endpoint arrives,
  because the real endpoint will not be shaped like a blockchain transaction.
- **Build them on a shape that describes what the screens actually show**, and
  write a small translator from today's transaction data into it.

We are proposing the second. The cost is one extra small piece of code now. The
payoff is that when your endpoints land, connecting them is writing one
translator, and not a single screen changes. Rewriting screens during an
integration is the expensive way to find out you guessed wrong.

## Things we are not rebuilding

A good part of this screen already exists elsewhere in the app, and we intend to
use it rather than write it again:

- The **search box** is already a shared piece. Used as is.
- The **pop-up panels** behind the "All Products" and "Last 30 Days" filters
  already exist on the memecoin screen, including sixty fiddly lines that keep
  keyboard focus trapped inside an open panel. Worth exactly one copy in the
  codebase.
- The **tab strip** exists too, on the perps screen, and it carries a note from
  whoever wrote it saying it is the third copy in the app and ought to be moved
  somewhere shared. We would be the fourth copy. So we move it instead.
- The **paging** at the bottom of the list already exists as a shared piece. The
  current Activity screen predates it and hand rolls its own, which we drop.

The one genuinely new shared piece is the **coloured status label** (Won, Lost,
Live, Processing, and so on). There are already six hand-made versions of this
scattered around the app, no two alike and none of them shareable. We build one
properly, in the shared place, so this is the last time anyone makes another.

## Something that would have broken

The Spot, Real Assets and Memecoin screens all redirect to a different page when
the window is narrow, because they are desktop screens with a separate phone
equivalent.

Activity is **not** one of those. It is a destination in the phone's bottom
navigation bar. If we had copied the pattern from its neighbours, the Activity
button in the phone nav would have stopped working. We found this while checking
and have written it into the decision so nobody adds it later.

## What you decided

Option 3: ship the history now, hold the in-progress tab until your endpoint is
ready. So this change builds the All Activity screen fully, and does not draw the
tab strip at all yet, because a tab strip with one tab in it looks broken. The
strip and the second tab arrive together, later.

## The question this answered

**The In Progress tab has nothing to show yet.**

It needs to know what you staked, what odds you took, what you might be paid, and
whether a thing has settled. None of that exists in the app today, and the
endpoint that will provide it is the one you are about to add.

Three ways forward:

1. **Build the tab, leave it empty until your endpoint arrives.** The screen is
   finished and correct; the tab honestly shows nothing until there is something
   to show. Switching it on later is a small change in one place.
2. **Piece it together from what exists.** We could hunt down prediction
   positions, Arkade stakes and withdrawal states separately and stitch them
   together. This is real work, and it builds the thing your backend is about to
   build, twice.
3. **Ship All Activity now, hold In Progress** until the endpoint is ready.

We recommended the first. The maintainer chose the third, which is the more
conservative version of the same reasoning: neither builds anything the backend
is about to replace, and the third does not put a tab on screen before there is
a reason for it to be there.

## In one sentence

We are rebuilding the Activity screen against a description of what the screen
actually shows rather than against blockchain transactions, so that plugging in
your new endpoints later is one small translator instead of a second rebuild.
