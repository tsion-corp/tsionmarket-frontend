# ADR-2026-09-07 for everyone: the new memecoin page

## What was there

The memecoin page had a "Simple / Pro" toggle. Simple showed eight trending
coins as cards. Pro showed a table of ten coins, a price chart that was blank
for most coins, and a search box. Both let you tap a coin to buy or sell it.

## What was wrong

- Two layouts for one task. The Pro table gave the exchange name the same
  weight as the coin's price. The chart rarely had data.
- Ten coins a page, with pages that sometimes came back short because a
  non-memecoin (Coinbase's wrapped Bitcoin) was removed after the page was cut.
- Now that Base and Solana coins are listed together, you could not tell
  which network a coin was on.
- No way to filter by risk band, and when a request failed you saw an empty
  list rather than a message.

## What we did

One page, one layout:

- **Trending now** at the top: five coins a page, with risk-band chips that
  show how many coins are in each band.
- **All memecoins** below: the whole catalogue as cards, 21 a page, with
  search, a network switch (All chains / Base / Solana) and the risk bands
  behind a Filters button.
- Every card shows the coin's network.
- Tapping a coin opens the buy/sell sheet straight away.
- If the market feed, the catalogue or search is down, the page says so and
  offers "Try again".

Wrapped Bitcoin no longer appears among the memecoins; it lives on the spot
desk where it belongs.

## What it means for you

Nothing to configure. The Simple/Pro toggle is gone. Search depends on the
trade service, which returned no results for any query on the day this was
built; the page handles that quietly, and the trade team has been told.
