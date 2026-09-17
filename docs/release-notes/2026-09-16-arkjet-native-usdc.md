---
date: 2026-09-16
feature: Arkjet native USDC amounts and cashier availability
scope: casino
scenario-impact: updated
---

# Arkjet Native USDC

Arkjet and the shared Chicken cashier use USDC directly, with a 0.1 USDC
minimum and 1, 2, 5, and 10 USDC shortcuts. Six-decimal input and amount
adjustments use integer base units; withdrawals display native USDC fees.

A temporary funding outage remains retryable rather than being presented as
an unconfigured vault. The cashier refuses older NGN funding configurations
so a mixed frontend/backend rollout cannot send a mispriced transfer.

Verification covers preset controls, minimum stakes, decimal precision,
withdrawal fees, transient recovery, disabled funding, and legacy configuration
rejection. Real wallet transfers and deployment testing remain manual.

Arkjet's header and cashier reuse a cached Base snapshot from the portfolio.
Cold or stale wallet reads query Base only. The shared ledger cache is scoped
to the signed-in account, and native-USDC keys exclude old NGN snapshots.

Round polling is reduced from 250 ms to one second. Settlements refresh tickets,
history, and the internal balance; slow repair polls replace the previous
500 ms ticket and two-second balance/history loops. Failed reads back off for
one minute, and a service-wide cooldown honors Retry-After after a 429.
Background tabs do not poll. Initial setup still uses separate endpoints;
these changes do not replace Arkjet's ledger with an on-chain wallet balance.

Deploy only with the backend native-USDC ledger migration. Legacy deployments
need a backup, verified conversion rate, and a maintenance window with active
tickets and withdrawals drained. No production funds are seeded by the frontend.
