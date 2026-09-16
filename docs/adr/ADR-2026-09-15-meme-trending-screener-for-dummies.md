# ADR for Dummies: Trending coins and filters on the memecoin desk

**Status:** approved on 2026-09-15, with two changes asked for by the
maintainer: the phone version gets it too, and Trending follows the filters.

The technical version is `ADR-2026-09-15-meme-trending-screener.md`.

## What's the situation?

The memecoin page on desktop has two halves. On the left is a table of coins
with page numbers. On the right is the buy and sell ticket with its chart.

We want the left half to be more exciting and more useful:

- A **Trending** row at the top showing the hottest coins right now.
- The **main table** underneath, still with page numbers.
- Each coin's **gain or loss** shown in a fun, game-like way.
- **Filters** so a trader can narrow the table: market cap, price, how new the
  coin is, number of trades, trading volume, number of traders and liquidity.
  The table can also be sorted by any of those, over the last 5 minutes, 1 hour,
  6 hours, 12 hours or 24 hours.

The right half, the ticket, does not move or change.

## What did we find out first?

We read the trading service's own code, not just its guide. Five findings
changed the design:

1. **Trending can't be paged by the server.** It hands back one list of up to
   100 coins, so the app splits that list into pages itself.
2. **Every filtered request is heavy for the server.** It checks every coin each
   time, whether we ask for 10 or 500. So we ask for 500 at once and page
   through them in the browser instead of asking again for every page.
3. **Many coins don't have short-term numbers yet.** A server bug means
   "last 5 minutes" and "last hour" figures are usually missing. We show a
   dash (—) instead of a fake zero, and tell the trader when a filter leaves
   those coins out. We will report the bug to the backend team.
4. **There is no "amount" filter.** The service doesn't have one. Price, market
   cap, volume and liquidity are the closest things, and all four are included.
5. **All our users share one request allowance.** The trading service allows
   about 100 requests a minute from our server, for everyone together. Asking
   too often could slow the page down for all users.

## What are we going to do?

**The left half becomes three stacked pieces:** the Trending card, a filter bar,
then the existing table. The desk stays the same height, so the table shows a
few fewer rows at once. That is the price of adding Trending without pushing
the ticket down.

**The fun part.** Each trending coin gets:

- a rank badge (#1, #2, #3…);
- its gain or loss in green or red;
- a "what if" line such as **"$100 → $112.34"**, what $100 would be worth if
  you'd bought at the start of the chosen time window;
- a mood tag: 🚀 Mooning, 🔥 Pumping, 🧊 Cooling or 🩸 Dumping;
- a heat bar showing how busy its trading is compared with the other coins;
- a quick flash of colour when its price updates.

In the table, the gain or loss column follows the chosen time window. The top
gainers on each page get a 🔥. When you sort by something like volume, that
number appears as an extra column so you can see why the order is what it is.

**The filter bar** has:

- time window buttons (5m to 24h);
- a Sort menu;
- a Filters panel with one-tap presets (Fresh launches, Big movers, Micro caps,
  Deep liquidity, Crowd favourites) and exact minimum and maximum boxes;
- small removable tags showing each filter in use.

Filters only run when you press **Apply**, so typing never floods the server.

**Not asking the server too often.** Every answer is remembered for this browser
tab in "session storage", the tab's short-term memory:

- Going back to a filter you already used shows the result instantly, with no
  new request for a minute.
- Reloading the page keeps the memory; closing the tab clears it.
- Trending refreshes every two minutes, and only while you're actually looking
  at it.

Everything follows the app's existing look: the same colours, cards, buttons
and animations, with animations turned down for people who ask their device for
less motion. All new text is translated into English, German, Spanish, French
and Portuguese.

## What stays exactly the same?

- The ticket, chart and everything else on the right.
- On the phone, the ticket, search and everything outside the coin list.
- Search. Typing a search still shows search results, and filters pause while
  you do.
- How the rest of the app saves data.

## What are the downsides?

- Slightly fewer table rows fit on screen at once.
- Short time windows will look sparse until the backend fixes its bug.
- Heavy filters could occasionally time out on the server. The table then shows
  its usual "try again" message.

## What about phones?

The phone memecoin tab gets the same things, arranged for a small screen:

- trending cards you swipe through;
- time window buttons that scroll sideways;
- Sort and Filters that open as sheets sliding up from the bottom.

Filters you set on one carry over to the other within the same browser tab.

## Does Trending follow the filters?

Yes. If you filter for coins under $1M market cap, Trending shows the hottest
coins under $1M. Sorting is different: Sort only reorders the table. If Sort
also applied to Trending, it would no longer show what's hot, just the same
list in a different order.
