# ADR-2026-09-09: Why every open tab costs 600 provider calls an hour, and how it becomes 260 (Plain English Guide / ADR for Dummies)

## Status

Proposed — 2026-09-09, waiting for the maintainer to approve.

## The Problem

We now have 30,000 users. A signed-in tab that is doing nothing still asks
the blockchain providers about 600 questions an hour: what does this wallet
hold on 28 networks, what has moved recently, what are prices. Most of
those answers do not change from one ask to the next, and 23 of the 28
networks are ones most wallets have never touched. Providers charge per
question, so this cost grows with every user we add.

## What We Do

- **Stop re-asking empty networks so often.** A network that keeps
  answering "nothing here" is asked again after 10 minutes, then an hour,
  then every two hours. The moment it holds anything, it is back on the
  normal schedule. The "Refresh balance" button forces a full re-read.
- **Poll the balance to match where the user is.** On the portfolio page
  the number refreshes every minute as now. On every other page, where
  only the small balance chip shows it, every three minutes. A trade still
  refreshes at once.
- **Ask for history less often and remember the answer longer.** The
  notification bell checks every 10 minutes instead of 5, and the server
  keeps the answer for 5 minutes instead of 90 seconds.
- **Prepare the balance on the server for every page**, not only the
  dashboard, so opening Spot or Memecoins does not pay for an extra fetch.

## What Changes For Users

Nothing visible on the pages people use. One edge case: money sent
directly to a wallet on a network it has never used before can take up to
two hours to appear unless the user taps Refresh. Deposits made through
the app land on Base and show as they do today.

## What Does Not Change

Trades, deposits and the Last Man game refresh exactly as they did this
week. Every number still comes from the chain; it is asked for less often.

## What Comes Next

Two bigger steps need a decision on infrastructure: a shared cache so the
cost is paid once for everyone instead of once per server, and provider
webhooks so the app is told when a wallet moves instead of asking.
