---
date: 2026-11-24
branch: feat/base-gas-balance
base: main
scenario-impact: none
---

# Base gas balance, shown only when Base gas is user-paid

Base sends stay gas-sponsored, so users see no change today
([ADR](../adr/ADR-2026-11-24-base-gas-balance.md)). If Base sponsorship is
turned off (`gasPolicy` for `base-mainnet`):

- The portfolio shows the wallet's ETH on Base.
- Under $1 it warns and offers an "Add ETH" button.
- The buy sheet blocks a buy the wallet can't pay gas for, and shows a
  gas-fee message instead of a generic failure.
- Max sells of Base ETH keep a 0.0003 ETH buffer for the fee.

The automatic $1 USDC → ETH top-up from the earlier version of this branch
is removed: no user funds move without the user acting.

Verified with the notice's tests (sponsored, user-paid low, user-paid
enough, loading), the buy-sheet gas tests, typecheck and the full preflight.
