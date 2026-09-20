---
date: 2026-09-20
feature: Balances recover on their own
scope: fix
scenario-impact: none
---

# Balances are never silently wrong

Some users saw no balance, or zero, while everyone else was fine. A remembered
balance was treated as correct forever, so a single failed read stuck until the
user pressed refresh.

- A half-failed read no longer passes for a complete one: when the chain read
  fails, every EVM network is reported as missing, which keeps the snapshot
  short-lived instead of caching an empty balance.
- A stored balance is trusted for five minutes, then re-read on the next mount,
  focus or reconnect. There is still no steady poll.
- A failed read, including the rate limit we deliberately do not retry in place,
  is retried every 20 seconds until a balance lands.
- A snapshot missing Base heals anywhere in the app, not only on balance pages.
- A browser that blocks site data loses the cached copy, not the page.
- A signed-in session whose wallet is not known yet shows loading, never zero.
