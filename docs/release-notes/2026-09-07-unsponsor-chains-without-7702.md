---
scenario-impact: updated
---

# Release Note: HyperEVM, ApeChain and opBNB back to user-paid sends

## Summary

After #389 flagged every EVM mainnet the gas policy covers as sponsored, the
first real HYPE sell on HyperEVM failed with the bundler's "Invalid fields
set on User Operation". Probed directly, Alchemy's bundler on HyperEVM,
ApeChain and opBNB answers `EIP-7702 is not supported on entry point 0x…032`;
the sponsored path delegates the embedded wallet with exactly that
authorization, so no sponsored send can complete there. The three chains are
unflagged and send user-paid again, as before #389. The other twenty flagged
chains accept the authorization and stay sponsored.

Decision record: addendum in `docs/adr/ADR-2026-09-07-sponsor-all-evm-mainnets.md`
(that ADR named the first real send as the verification for the smaller
chains and one flag as the reversal).

## What changed

- `config/alchemy-bso-evm-networks.json`: `sponsorshipMode` and `gasPolicy`
  removed from `hyperliquid-mainnet`, `apechain-mainnet`, `opbnb-mainnet`.
- Tests: the sponsored set excludes the three; HyperEVM's measured gas
  reserve (0.001 HYPE) is back; the send hook routes HyperEVM through the
  ordinary wallet send; a max HYPE sell leaves the fee behind again.

## Verification

- Per-chain bundler probe above (every flagged chain).
- Red then green across the registry, gas-buffer and send-hook suites; full
  preflight.
- After deploy: the reported HYPE sell from a wallet holding a little HYPE
  for gas completes; the sell sheet shows the gas hint on HyperEVM.

## Scenario impact

`updated`: on HyperEVM, ApeChain and opBNB the sell sheet asks for native gas
again and a max sell of the native token holds back the fee. Sells there work
again, which they did not since #389.
