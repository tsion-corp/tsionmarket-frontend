---
scenario-impact: updated
---

# Release Note: Gas sponsorship on every EVM mainnet the policy covers

## Summary

Selling USDC on Arbitrum refused with "Your Arbitrum wallet needs a little
ETH before it can send". The app only treated Base and Polygon as sponsored
(#343) although the team's one Gas Manager policy covers every mainnet the API
key can reach. Twenty-three mainnets are now flagged as sponsored through the
paymaster path; sells, RWA buys and other sponsored sends on them no longer
need native gas in the wallet.

Decision record: `docs/adr/ADR-2026-09-07-sponsor-all-evm-mainnets.md` and its
plain-English companion. Plan: `docs/plans/2026-09-07-sponsor-all-evm-mainnets-plan.md`.

## What changed

- `config/alchemy-bso-evm-networks.json`: `sponsorshipMode: "paymaster"` and
  `gasPolicy: true` on eth, base, arb, apechain, berachain, bnb, celo, cronos,
  frax, gensyn, hyperliquid, ink, monad, opbnb, opt, plasma, polygon,
  robinhood, shape, soneium, stable, unichain and worldchain mainnets.
- Left user-paid: testnets, `arbnova-mainnet` and `polynomial-mainnet` (key
  has no access), `edge-mainnet` (no read client).
- Tests: the registry test now holds the exact sponsored set and two
  invariants (paymaster mode, read client present); the gas-buffer test
  expects no reserve on the sponsored chains.

## Verification

- Every network probed directly against Alchemy with the production policy
  (`eth_chainId`, then `pm_getPaymasterStubData`); table in the ADR.
- Red then green on the two test files; full preflight.
- After deploy: the reported Arbitrum USDC sell from a wallet with no ETH.

## Scenario impact

`updated`: spot sell and RWA buy on the newly sponsored chains show no
native-gas requirement and the max sell of a native token is the full
balance. All chains draw on one sponsorship budget; Ethereum mainnet is the
expensive one, included on the maintainer's instruction.
