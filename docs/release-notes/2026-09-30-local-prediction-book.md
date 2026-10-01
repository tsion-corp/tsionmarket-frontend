---
date: 2026-09-30
feature: First-party dynamic parimutuel prediction book
scope: feature
scenario-impact: prediction markets
---

# Local prediction book

Prediction now includes a first-party sportsbook flow for platform-created
events and child markets. The initial Fight Night event demonstrates fight
winner, distance and total-round markets with participant artwork and the same
desktop drawer and mobile ticket sheet used by the existing prediction flow.

Selections show live pool projections. The ticket recalculates projected odds
and returns for the entered stake, keeps heavily backed outcomes selectable as
their odds approach 1.00, and makes clear that accepted odds are projections
rather than locked prices. A market that closes with stakes on only one outcome
is refunded automatically.

Users can place singles with Base USDC without manually pre-funding a separate
screen. When the prediction ledger is short, the ticket transfers only the
missing amount to Prediction custody, confirms the deposit idempotently, then
refreshes the pool quote before placing the bet. Ticket history and six-character
booking codes are available from the same sidebar.

The frontend proxy routes `/book/*` requests to the Rust `prediction` service
on the configured WSAPI gateway. Existing market, group and comment requests
continue to use the separately configured `prediction-market` service.
