---
date: 2026-09-29
feature: Spin Da Bottle uses its dedicated wallet for deposits, balances and withdrawals
scope: fix
scenario-impact: needs_automation
---

# Spin funds stay inside Spin custody

The Spin Da Bottle cashier now loads the dedicated Spin funding address and
balance. Deposits are confirmed against that custody scope, and withdrawals are
requested from the same dedicated wallet instead of the shared Arkjet and
Chicken wallet.

Pending deposits and withdrawal idempotency keys are namespaced by custody
scope so a shared-wallet transaction cannot be resumed or submitted through
Spin accidentally. API responses are also checked for the expected scope before
the frontend accepts them.

The bottle animation continues to use the server's effective outcome. This
keeps the visual result aligned with the settled wager, including a disclosed
liquidity-adjusted opposite-direction result.

## Verification

Funding unit tests cover scope validation, separate pending transactions and
the Spin API path selection. Prettier, ESLint, TypeScript, Vitest, production
build, bundle budget and release-note checks must pass before release.
