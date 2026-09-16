---
date: 2026-09-12
feature: The Arkade gets its own shelf, and the conversation band is Square alone
scope: portfolio, discovery
scenario-impact: updated
---

# The Arkade gets its own shelf, and the conversation band is Square alone

## What changed

- **The holdings modal no longer takes the keyboard.** Opening it put focus in
  the search field, which raised the phone keyboard over the very list the
  reader opened it to read. Focus lands on the dialog itself now, so the
  screen reader and the focus trap still start inside it, and typing is a
  choice made by tapping the field.
- **"Play the Arkade" is its own shelf on the home page**, beside the other
  services' shelves, with one card per game: the Last Man poster, Chess,
  ArkBall, Checkers, Arkjet and Pilot Chicken. Live figures come from the
  dashboard feed the server already composes: the open round worth joining and
  how many checkers matches are being played.
- **"Join the Conversation" is Square and nothing else**: the chess room the
  band was drawn around, the rooms live right now, the way into a room of your
  own, and the feed. One band answered two questions before, games and rooms
  mixed together; each has its own heading now.

## The new cards

Each is the band's shared frame in its own hue, with a motif drawn in CSS
where the room cards scatter faces, so a card needs no artwork of its own:

- **Chess**, ink to royal blue: a board tilted the way it sits across a table,
  with the pieces as glyphs.
- **Arkjet**, ink to jet orange: the climb as a quarter-circle curve with the
  plane at its head, a multiplier chip, and the game's hero art fading in.
- **Pilot Chicken**, ink to lime: the lanes in perspective over the game's own
  art.
- **Go live**, ink to rose: the on-air ring, with the badge the checkers card
  uses for a live count.
- **The feed**, ink to indigo: three posts stacked back into the card, the top
  one still being written.

## One button per card

Every card on both bands ends in a single pill, at the size the prediction
row's "Predict Now" is drawn: a 15px label in 20.571 by 12.857 gutters. Two
pills asked the reader to choose before they had read the card, and these rows
are a set of doorways rather than a menu. The nine labels the second pills used
are gone from all five catalogues.

## The cards on a phone

A phone's card is about a third of the width the band was drawn at, and the
copy and the pill could not share a row there: the pill took half the card,
wrapped its label over two lines, and left the headline three words and an
ellipsis. Below md the copy now takes the card's full width with the pill
under it, at 13px in 14 by 9 gutters, and a scrim carries the words over the
art. From md the layout is exactly as drawn: copy in its column, pill beside
it at the "Predict Now" size, no scrim.

## A sale that failed for gas said the wrong thing

Reported from staging: selling USD₮0 on HyperEVM failed with "You don't have
enough of this asset for that. Try a smaller amount." The wallet held the
asset. The node had said `gas required exceeds allowance`, which is the account
being unable to pay the fee, and the message mapping matched it on "exceeds
allowance" before the fee rule could see it. The reader was told to try a
smaller amount, which can never help.

- The fee phrasings are read first now, so a gas shortfall reads as a fee
  problem.
- The sell sheet names what to top up when it knows the chain: "Your HyperEVM
  wallet needs a little HYPE before it can send", rather than "the network's
  coin".

HyperEVM pays its own gas by design. #401 unsponsored it, along with ApeChain
and opBNB, after probing Alchemy's bundler: those three answer "EIP-7702 is not
supported on entry point 0x…032", and the sponsored path delegates the embedded
wallet with exactly that authorization, so no sponsored send can complete
there. The other twenty mainnets accept it.

So the sheet's own check is what has to hold, and it did not: it asked whether
the wallet held any of the chain's coin at all, and dust passed. It now asks
whether the balance covers the measured cost of a send, the same figure the
sheet already reads to work out a maximum sale of the gas token itself. That
figure is a plain transfer, which is the cheapest send there is, so it is a
floor rather than a promise; while the measurement is still out, the old test
stands rather than blocking a sale on a read that has not answered.

## A holding that cannot be sold is not shown

Naming the coin to top up is a better error, but it is still an error, and
paying for gas is not something this platform asks of anyone: everywhere it can
be sponsored, it is, and the reader never learns the word. The three chains
that cannot be sponsored are the exception, and the honest answer there is not
to offer the sale at all.

`selectHoldings` now drops a holding on an unsponsored chain when the wallet
holds none of that chain's own coin, because that balance cannot be moved. The
USD₮0 in the report disappears from the list rather than failing at the fee. If
the wallet does hold some HYPE, the row is there and the sale goes through as
before, and every sponsored chain, Solana included, is untouched.

This is display-only, the same way the USDC settlement float above it is: the
balance is real, the totals still count it, and trade balances, funding and
search all still see it. Both the holdings modal and the portfolio table read
this one selector, so they cannot disagree.

## Tests

- `holdings-modal.test.tsx`: focus lands on the dialog, not the search field,
  and still returns to the trigger on Escape.
- `arkade-row.test.tsx` (new): one card per game in the Arkade's own order, the
  heading into the Arkade, the richest open round on the Last Man card.
- `conversation-row.test.tsx`: the band deals the room, the rooms, going live
  and the feed, and carries no Arkade game.
- `arkade-cards.test.tsx` (new) and `conversation-cards.test.tsx`: each card's
  own copy and where its single pill leads.
- `holdings.test.ts`: a token on an unsponsored chain is hidden when the wallet
  holds none of that chain's coin, kept once it does, and neither a
  sponsored-chain nor a Solana holding is touched.
