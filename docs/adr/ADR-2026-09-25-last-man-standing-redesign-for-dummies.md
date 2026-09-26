# ADR for Dummies: The Last Man gets its new look

**Status:** approved on 2026-09-25, from the designers' Figma.

The technical version is `ADR-2026-09-25-last-man-standing-redesign.md`.

## What's happening

The designers rebranded the Last Man Standing game screen and it looks far
better: a big stage with a countdown ring, a card on the right for whatever you
can do right now, and a tabbed panel underneath with recent plays, the rules and
past rounds.

## The catch, and how we handled it

The Figma draws **four** situations: nobody has played yet, a round is running,
a round has ended, and you won.

The real screen has about **sixteen**. The extra twelve are the unglamorous
ones nobody draws: the connection dropping, the clock running out, not having
enough money to play, a bet being placed, the round ending but not yet being
**settled** (the step that actually pays the winner), errors, and so on.

If we built only what was drawn, we would have deleted the step that pays
people. So we kept every situation and gave the undrawn ones the new look too.
Nothing about how the game works, how money is counted or how the clock runs was
touched. This is a new coat of paint on the same engine, which is the safest way
to do a redesign on a screen that handles real money.

## Decisions you made along the way

- **Keep every state**, rather than shipping only the four drawn ones.
- **Phones matter**, so it adapts rather than being desktop-only.
- **The right-hand card follows the situation** — you never see "Add to your
  position" before a round exists — while the dots still let you reach the
  invite card at any time.
- **Player pictures come from Market Square.**

## One thing that is not finished

We can show _your_ Square picture, but not other players'. There is currently no
way to look up a player's profile from their wallet address. Everyone therefore
gets a generated picture: the same wallet always gets the same one, so faces
stay recognisable. The moment your backend dev adds that lookup, real pictures
appear with no further work here.

## Small text fixes

Three typos in the design were corrected in the app's text: "winings" to
"winnings", "Every players who join" to "Every player who joins", and "The first
confirm leader takes the lead." to "The first confirmed play takes the lead."
Tell us if any of those were deliberate.

## What to look at in review

The eleven situations the designers did not draw now have a look we chose
ourselves, in the same visual language. They are worth a pass from the design
team to confirm they match the intent.
