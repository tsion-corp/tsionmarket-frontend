---
date: 2026-09-20
status: proposed
---

# Why some people could not see their balance

## What people saw

Their balance was missing, or showed zero, while everything looked fine for
everyone else.

## Why it happened

To save money and speed the app up, we started remembering the last balance and
showing it straight away, and we stopped checking it on a timer. A balance only
changes when the user does something, so that was a good trade.

The problem was what happened when a check went wrong. The remembered figure
was treated as correct forever. So if the one check a user made went wrong, the
bad result stuck:

- If the part that reads their coins failed but another part answered, we saved
  a balance of zero and called it complete.
- If our provider told us "too many requests", we gave up and never asked again.
- If their browser is set to block saved site data, the whole page could fail.
- If the app had not yet been given their wallet address, we showed zero instead
  of "still loading".

The refresh button did fix it, which is why it looked fine for anyone who
pressed it, and why only some users complained.

## What we changed

A remembered balance is still shown instantly, but it is only trusted for five
minutes. After that, opening a screen, returning to the tab, or reconnecting
checks once. A check that failed is retried on its own until it works. A
balance that is missing one network repairs itself. We never show zero when we
simply do not know yet, and a browser that blocks storage loses the saved copy
rather than the whole page.

We also now run our own Base connection, so these checks cost us far less than
they used to.

## What it costs

A few more checks than before, mostly against our own connection, in exchange
for users never being stuck looking at a balance that is wrong.
