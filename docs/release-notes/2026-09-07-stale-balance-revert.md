---
scenario-impact: none
---

# Release Note: a sell refused for a changed balance says so and refreshes

## Summary

An mUSD sell on Ethereum pressed a second time, after Dextopus had refunded
the first one net of fees, reverted with the token's
`InsufficientBalance(address,uint256,uint256)` and the user saw raw hex. The
selector now maps to copy that names the cause ("your balance is lower than
shown"), and the sell sheet refetches the portfolio on any balance revert so
the next press clamps to the live balance instead of the stale snapshot.

## What changed

- `lib/errors.ts`: selector `0xdb42144d` in the custom-error table;
  `isStaleBalanceRevert()`.
- `features/trade/components/sell-sheet.tsx`: refetch on a balance revert.
- Tests in `lib/errors.test.ts`.

## Verification

Red then green; full preflight. Chain evidence: the wallet's mUSD moved at
16:01 UTC to a Dextopus deposit address whose status is REFUNDED; the
balance afterwards was 0.761532 against a 0.896202 send.

## Scenario impact

`none` visible beyond clearer copy.
