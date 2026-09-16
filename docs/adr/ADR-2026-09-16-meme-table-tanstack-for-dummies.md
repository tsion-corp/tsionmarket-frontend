# The memecoin table, in plain words

Companion to [ADR-2026-09-16-meme-table-tanstack.md](./ADR-2026-09-16-meme-table-tanstack.md).

## What people wanted

On the memecoin desk there is a list of coins with columns: the coin, its price,
how much it moved, its market cap.

Two things were missing that anyone who has used a screener expects:

- **Click a column heading to sort by it.** You could sort, but only by opening
  a separate menu and choosing from it.
- **Type to find a coin.** There was no search box over the list.

## What we did

We put the list on a library called TanStack Table, which the app already uses
for two other tables. It is a "headless" library: it does the thinking about
rows, sorting and searching, and leaves the appearance entirely to us.

So **the table looks exactly the same**. Same columns, same row height, same
colours. What changed is that the headings are now buttons, and there is a
search box.

## The careful bit

The list already knew how to sort itself, and it is fussy about it for a good
reason: these are money figures that arrive as text.

Sorted naively, "9" looks bigger than "10", and a coin worth
$3,491,589,227 can end up beside one worth $25,564 in the wrong order. The
existing code compares the numbers digit by digit so that cannot happen, and it
puts coins it cannot measure at the bottom rather than pretending they are worth
nothing.

**We did not let the new library take that over.** It renders the order; the
existing code still decides it. The library is allowed to run the search box,
because that compares words, not money.

There is also only ever **one** sort. Clicking a heading and choosing from the
menu are the same action — the heading is just a faster way to reach it — so the
two can never disagree, and whichever you use is also what gets sent to the
server.

## About the search box

It searches **the coins already loaded**, not every coin in existence. The list
says so underneath: "12 of 140 loaded".

That is an honest limit rather than a shortcut. Searching everything is what the
filters do, because those are sent to the server, which holds all 138,000 of
them.

## The phone is untouched

The phone version of this screen is not a table at all — it is a list of cards,
which is the right shape for a narrow screen. It was asked that it stay as it
is, and it does: not one line of it changed.

## Anything to worry about?

The one real risk is having two ways to say the same thing — a heading and a
menu — drifting apart. We avoided that by making the heading a shortcut into the
existing setting rather than a second setting of its own.

Nothing got slower or heavier: the library was already being downloaded for
other screens.
