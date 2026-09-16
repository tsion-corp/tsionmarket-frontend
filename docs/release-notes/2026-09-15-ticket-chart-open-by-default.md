---
date: 2026-09-15
feature: Ticket cards open on their chart
scope: rwa, spot, memecoins
scenario-impact: updated
---

# Ticket cards open on their chart

## What changed

The ticket card on Real assets, Spot and Memecoins now shows its price chart
when it first draws. "View Chart" still folds it away, and opens it again.

Every surface that draws one of those tickets changed, on the desk and on the
phone alike:

- **Real assets:** `RwaTicket`, which both the desk and the phone list render.
- **Spot:** the desktop desk (`SpotDesktopView`) and the phone ticket
  (`SpotTicket`).
- **Memecoins:** the desktop desk (the `/meme` route) and the phone ticket in
  the Market page's Memecoins tab (`MobileMarketView`).

The phone Memecoins ticket had no chart at all, only the Market Metrics row. It
now carries the same "View Chart" row and chart the phone board design draws
(`BoardDisclosure` and `BoardChart`), above the Buy / Sell switch, open by
default. `MemeBoard`, which already drew that row, is not rendered by any route;
its default was changed too so the two cannot disagree if it is mounted again.

In each, the disclosure's starting state went from closed to open. Nothing else
about the chart changed: closing it still unmounts the chart, so a folded chart
resolves no chart id and subscribes to no price series.

The spot and Real assets desks' loading placeholders now hold room for the
chart in the ticket column, so the ticket does not grow by a chart's height when
the list lands.

## Why

The price is the first thing someone checks before a trade. Behind a closed
"View Chart" it took a tap to see on every ticket, every time.

## Cost

The chart's code (lightweight-charts, about 168KB) still loads as its own chunk
rather than in the page bundle, but it now loads with the ticket instead of on
the first "View Chart" tap. The chart's data request (a CoinGecko id lookup and
its price series, or the RWA price history) likewise starts when the ticket
draws. Comments that justified the dynamic import by "the panel starts
collapsed" are reworded to say what the import still buys.

## Scenario impact

Any manual or automated scenario that opens a ticket and then taps "View Chart"
to see the chart now finds it already open, and that tap closes it instead.

## Tests

Each suite that pinned the closed default now pins the open one, written first
and seen failing before the change:

- `rwa-ticket.test.tsx`: opens expanded with the price history panel drawn, and
  folds it away on request.
- `spot-ticket.test.tsx`: the disclosure starts expanded and closes on tap.
- `spot-desktop-view.test.tsx`: new test, the desk ticket opens on the chart
  (here the market has no chart id, so the open panel says so) and folds away.
- `app/(session)/(app)/meme/page.test.tsx`: the rail opens with the chart
  mounted, unmounts it on "Close Chart", and mounts it again on "View Chart".
- `meme-board.test.tsx`: the board's panel starts at full height with the
  chart mounted, and folding it shut unmounts the chart.
- `mobile-market-view.test.tsx`: new test, the phone Memecoins ticket opens with
  "Close Chart" expanded and the chart mounted, and folding it unmounts the
  chart.
