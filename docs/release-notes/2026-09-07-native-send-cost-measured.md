---
scenario-impact: updated
---

# Release Note: the gas reserve for a native max sell is measured from the node's estimate

## Summary

Selling APE on ApeChain failed with "Execution reverted with reason: gas
required exceeds allowance (15749)". The sell sheet's reserve for a
native-token max sell assumed a transfer costs exactly 21,000 gas. On an
Arbitrum Orbit chain the gas a transfer is charged includes the L1 posting
component, so the node's requirement runs well above that and the amount
left behind could not pay for the send. The reserve is now measured from the
node's own estimate of a transfer, floored at 21,000, and priced at the fee
cap a wallet actually sends with on an EIP-1559 chain, twice the base fee
plus the tip (the second APE failure, "gas required exceeds allowance
(15876)", implied a fee of exactly twice the base fee), with a quarter
headroom; a chain without a base fee is priced at its gas price; a node that
will not estimate falls back to the floor.

## What changed

- `lib/trade/native-gas.ts`: `estimateGas` for a value-only transfer,
  floored at the protocol minimum, fallback with a warning.
- `lib/trade/native-gas.test.ts`: measured gas above the floor; floor kept
  when the estimate is lower or unavailable.

## Verification

Red then green; full preflight. After deploy: a max APE sell on ApeChain
completes, leaving a few thousandths of an APE behind.

## Scenario impact

`updated`: a native max sell on ApeChain and Arbitrum holds back a slightly
larger, correct reserve; other chains unchanged.
