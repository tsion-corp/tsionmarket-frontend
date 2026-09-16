# Bringing perps up to date with the backend, in plain English

## What is happening

The team that runs the perpetual futures ("perps") service updated how it
works and wrote down the new rules. Our app still follows some of the old
rules, so parts of perps either work the slow way or do not work at all.

Four things are out of date:

1. **Adding money to perps** still takes a long detour: your USDC goes to
   another network first and is then bridged across. The backend now supports a
   direct route, run by Circle (the company behind USDC), that lands the money
   in your perps wallet in about a minute.
2. **Taking money out of perps** is broken against the new backend. The backend
   now charges a small platform fee as a second signed step, and our app does
   not send it yet.
3. **The app checks for updates too often.** It asks for your positions and
   orders every 15 seconds even when you have nothing open, and asks for your
   perps balance every 20 seconds on every page. The new rules say to check
   only when something could actually be changing.
4. **The name of the trading venue behind perps must never be shown to users.**
   One message in the app still shows it.

## What we are doing

We keep the perps screen exactly as it looks today and change what happens
underneath:

- **Top up** uses Circle's direct route. Before sending, the app asks Circle for
  the current fee instead of guessing it. If there is a fee for you to pay, you
  see it and what will land; if it is free, no fee line appears.
- **Withdraw** sends the new fee step. You type the total that leaves your perps
  wallet, and the app shows one fee number and what you will receive. Money
  amounts are calculated exactly, never with rounding shortcuts.
- **Updates** happen when they matter: positions refresh every 10 seconds only
  while you have one open, orders every 30 seconds only while one is waiting to
  fill, and your balance refreshes after you trade or come back to the tab.
- **The venue's name** is removed from that message, and every error message
  from perps is checked for it before it is shown.

The backend's author had already built a version of this on an older copy of
the app. We reuse the solid parts of that work (the Circle pieces and their
tests) but not the parts that would undo the current perps screen or break our
rules on handling money.

## One decision we are leaving to you

The Terms and Privacy pages name the trading venue. A privacy policy may be
legally required to list who handles user data, so we are not changing those
pages without a decision from you (and likely legal).

## Why it matters

Withdrawals work again, top-ups get much faster, perps stops making needless
network calls, and the app keeps the promise not to show the venue's name.

## What it costs

- Circle's fee check becomes a new dependency: if it is down, the app refuses to
  top up rather than risk a transfer that gets stuck.
- This moves real money, so before it ships someone does a small real top-up
  and withdrawal on staging with a funded wallet.
