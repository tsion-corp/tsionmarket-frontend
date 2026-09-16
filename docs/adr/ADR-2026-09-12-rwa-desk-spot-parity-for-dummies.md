# Making the Real assets page look like the Spot page, in plain English

## What is happening

The app has two trading screens that do much the same job and look nothing
alike.

**Spot** is the new design. One search box at the top. A big list of coins on
the left that fills the screen all the way to the bottom. An order slip on the
right that stays with you: it shows the coin, how it moved today, a chart you
can open, a Buy/Sell switch, a box to type how much, some quick amounts, a
summary of what it costs, and one big button. You pick a coin on the left and
price it on the right, without anything popping up.

**Real assets** is the old design. It has a heading, a row of category buttons,
a small search box pushed off to the right, and a short table with a Buy button
at the end of every row. Nothing stays selected. To buy anything you tap a row,
a window pops up with details, you press Buy in that window, and the window
changes into a trade form. Two pop-ups before you can type an amount.

On a phone the same gap exists. The Spot tab replaces the list with the order
slip right there on the page. The Real assets tab still opens pop-ups.

## What we are doing

Rebuilding the Real assets page so it is the Spot page, in layout and in
behaviour, on desktop and on phone. Same search box, same two panels, same
table, same table height, same order slip, same big button. The old design is
removed, pop-ups included.

The only differences are the things that are genuinely different about real
assets, and there are three.

**The fourth column.** Spot's last column is "Mcap", which is roughly what a
coin is worth in total. For tokenised gold, property and treasuries we mostly
do not have that number, and printing an empty dash on most rows is worse than
useless. We show "Liquidity" instead, which is how much can actually be traded.
That is the number this part of the app already shows, and already trusts.

**The chart.** Spot's chart and the Real assets chart come from different
places, so the panel that opens looks the same but is fed differently. Nothing
changes for the reader.

**A few extra lines in the order slip.** Real assets trades sometimes need more
than one signature, and some of them move money between networks before they
can complete. The slip keeps the small progress line that says which step you
are on, and the notice that lets you carry on browsing while a transfer
finishes. Spot does not need either, because Spot trades happen in one place.

## The part worth being careful about

Buying a real asset is not always one step. If you are buying something that
lives on Solana and your dollars are on a different network, the app does not
trade straight away: it moves the money first, writes down what it was doing,
and finishes the purchase afterwards, even if you close the page or reload.
Selling on Solana works the same way in reverse, bringing the proceeds back.

That bookkeeping is the difference between a trade completing and someone's
money sitting on the wrong network with nobody watching it.

So we are **not** rewriting it. We are lifting it out of the old screen
untouched and plugging the new screen into it. The new page is a new face on
the same working machinery. If we instead wrote a fresh order slip that looked
right, it would be very easy to lose those steps without noticing, and the way
you would find out is a user losing track of their money.

## Why it matters

Someone who has learned to trade on one screen should not have to learn a
second screen to buy gold. Right now they do.

It also pays off beyond this one page. Most of the Spot screen's parts are
being moved into the shared toolbox that every part of the app draws from, with
their wording handed in from outside rather than baked in. That is the house
rule already: shared pieces are not allowed to know which product they are
being used by. After this, the next market we build gets this layout for free
instead of rebuilding it a third time.

## What we are giving up

Two things, and both are deliberate.

**Category buttons go away.** You can no longer tap "Gold" or "Treasuries" to
filter. There are about thirty assets in the list and the search box finds any
of them. If the list ever grows into the hundreds, filtering comes back, but as
part of the search row rather than as a strip of buttons.

**Column sorting goes away.** You cannot currently sort Spot by price either,
and the list already puts the assets you can buy most easily at the top. If
sorting turns out to be missed, it should be added to both screens together,
not to one of them.

## What is not changing

The prices, where the data comes from, how trades are signed, and the
background process that finishes cross-network transfers. Also the Spot page
itself: it should look and behave exactly as it does today when this is done,
and its existing tests are what proves that.
