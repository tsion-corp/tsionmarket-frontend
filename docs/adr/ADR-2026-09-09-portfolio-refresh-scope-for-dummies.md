# ADR-2026-09-09: Why one trade made 340 provider calls afterwards, and how it now makes two (Plain English Guide / ADR for Dummies)

## Status

Proposed — 2026-09-09, waiting for the maintainer to approve.

## The Problem

After a trade the app wants to show the new balance quickly. To do that it
asked the server for a fresh balance, and kept asking until the number
changed, up to six times. Each "fresh" request told the server to ignore
everything it remembered and re-read the wallet on all 28 networks we
support, even the 23 where this wallet has never held a cent. That is
about 340 provider calls per trade, for one user, on top of the trade.

Three smaller things were wasteful in the same way:

- A bank deposit that is waiting for the money was checked by three parts
  of the app at once, every 3 seconds while the screen was open and every
  15 seconds after it closed.
- Typing a withdrawal amount asked our payments partner for a price on
  every change, and each price request also reserved a fresh deposit
  address that was then never used.
- Balance reads relied on one provider with no backup, so if that provider
  said "slow down" every balance on screen failed.

## What We Do

- **Read only what changed.** A fresh request now names the network the
  trade happened on. The server re-reads that one network and keeps its
  memory of the other 27. About two calls instead of 340.
- **Use the receipt.** The trade's receipt already says exactly what left
  and what arrived. The app applies that to the balance on screen the
  moment the receipt lands, then confirms with the one-network read.
- **One clock for a bank deposit.** Every 3 seconds for the first minute
  after you say you have paid, then every 15 seconds, from one place, and
  never while the tab is in the background.
- **Price previews do not reserve addresses.** Our partner has a "dry"
  mode for prices. The preview uses it; the real address is reserved once,
  when you confirm.
- **A backup provider for balance reads**, the same one the server already
  uses, so a bad minute at the first provider does not blank the screen.

## What Changes For Users

Balances after a trade appear a few seconds sooner. Everything else looks
the same. Under the hood a trade costs a fraction of the provider calls it
did, and a bank deposit in progress no longer keeps three timers running.

## What Does Not Change

Every number the user confirms against is still a real, live quote. The
balance is still verified on-chain after a trade; the receipt is only used
to show the right number sooner. If a trade comes back without a receipt,
the app behaves exactly as it did before this change.
