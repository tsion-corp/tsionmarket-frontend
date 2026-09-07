---
scenario-impact: none
---

# Release Note: sponsored sends on Arbitrum pass the bundler's fee precheck

## Summary

Sponsored sends on Arbitrum failed with `precheck failed: maxPriorityFeePerGas
is 0 but must be at least 831187`. The paymaster path let viem estimate fees
from the chain, and Arbitrum's priority-fee estimate is 0; Alchemy's bundler
enforces a floor it publishes as `rundler_maxPriorityFeePerGas`. The send now
reads that floor, adds 25% headroom, and uses the larger of it and the
chain's estimate; the proxy allows the method.

Decision record: `docs/adr/ADR-2026-09-07-paymaster-priority-fee-floor.md`
(+ plain-English companion).

## What changed

- `lib/trade/sponsor-fees.ts` (new): `paymasterFeesPerGas`.
- `lib/trade/sponsor.ts`: paymaster branch passes the estimator to viem.
- `lib/server/alchemy-bundler.ts`: `rundler_maxPriorityFeePerGas` allowed.

## Verification

Live probes of the chain and bundler fee answers on Arbitrum, Base and
Polygon; red then green (fee helper, proxy allowlist); full preflight. After
deploy: the reported Arbitrum sell.

## Scenario impact

`none` visible.
