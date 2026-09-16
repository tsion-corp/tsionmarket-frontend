# Buying from the home screen banners, in plain English

## What is happening

The home screen has rows of cards showing things you can buy: trending
tokens, memecoins that are running, and real-world assets like gold and
treasuries. Each card has a Buy button.

Right now that button is a link. Tapping it throws you off the home screen
onto a whole other page, where you then have to find the same asset again
and start the purchase from there. It is slow, and it loses your place.

## What we are doing

Tapping Buy on one of those cards will pop open a panel over the home
screen instead. The panel shows the asset's chart, its price and its key
figures, and a Buy button that takes the purchase from there. Close it and
you are back exactly where you were, still scrolled to the same spot.

We are not inventing this panel. It is the same one the app already uses in
your portfolio: tap a coin you hold and you get its chart, its numbers, and
Buy more / Sell. We are pointing the home screen's buttons at it too.

One piece is genuinely missing and we are adding it: you can already sell a
memecoin from that panel, but not buy one. That gets filled in, using the
memecoin trading sheet the app already has.

## What is not changing

- The full pages for tokens, memecoins and real assets stay exactly as they
  are. Links to them still work. This is a shortcut, not a replacement.
- Each row's "View all" heading link still takes you to the full desk.
- The other banners in the portfolio, Kash, staking and Market Square, are
  not touched. None of them is a buy button for a token, so none of them is
  part of this.
- A card with no live asset behind it yet still just links, because there
  would be no chart or price to show.

## Why it matters

Buying should feel like one tap from wherever you spotted the thing, not a
trip to another page and back. The panel keeps the reader on the home
screen, shows them the chart before they commit money, and reuses machinery
that is already live and already tested, so there is very little new
surface for a bug to hide in.
