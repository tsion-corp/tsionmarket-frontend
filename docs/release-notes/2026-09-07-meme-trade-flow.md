---
title: Memecoin trade flow settles on on-chain proof
date: 2026-09-07
area: memecoins
adr: ADR-2026-09-07-memecoin-board
scenario-impact: needs_automation
---

# Release Note: on-chain proof settles a memecoin trade

## What changed

- **On-chain proof settles the trade.** When the wallet's balance proves a
  Base trade delivered but the trade service later records it as FAILED,
  REVERTED or EXPIRED, the sheet shows the trade as done instead of "The
  trade didn't complete". The service's verifier compares a sponsored user
  operation's bundle transaction with the prepared call and fails, which is
  its recording fault; the discrepancy is logged and tracked as
  `trade_recording_mismatch` for the trade team. Without on-chain proof the
  failure is still shown.
- **Balances refresh after any failure**, so the form never argues with an
  amount the wallet no longer holds.
- **The settlement reconciler no longer restarts on unrelated renders.** Its
  loop depended on callback identities that change on every portfolio poll
  and wallet refresh; it now reads those through refs and restarts only when
  the pending set or the wallet's readiness changes. Applies to the RWA
  tracker as well.

## Scenarios

- Sell a Base memecoin: the swap executes, the service records FAILED, the
  sheet shows done with the USDC received; `trade_recording_mismatch` fires.
- A quote that fails before signing still shows the failure inline.

`scenario-impact: needs_automation` — the hook test covers the delivered
but recorded-failed path; a browser run needs a signed-in session.
