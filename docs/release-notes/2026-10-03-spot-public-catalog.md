---
date: 2026-10-03
feature: The spot markets list renders without signing in
scope: fix
scenario-impact: updated
---

# Spot markets for visitors

Signed out, the spot page said "Markets are unavailable right now". The
markets list is built from the Dextopus buy catalog (which assets USDC on Base
can buy), and the Dextopus proxy refused every request without a session.

The proxy now serves the catalog reads (`deposit/chains`, `tokens`, `sources`,
`destinations`) to anyone, for GET only. They are the same for every caller
and already cached on the server for ten minutes. Quotes, orders, deposits and
status reads still need a session, and Buy still asks a visitor to sign in.

## Scenario impact

Updated: open `/spot` signed out; the markets list renders, and Buy shows the
sign-in toast.
