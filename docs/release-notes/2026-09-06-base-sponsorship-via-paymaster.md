---
scenario-impact: updated
---

# Release Note: Base sponsorship runs through the paymaster path

## Summary

Every gasless transaction on Base failed with Alchemy answering
`eth_sendUserOperation` with "Policy with ID … does not support bundler
sponsorship". The team's Gas Manager policy is a paymaster-type policy; the
app was sending it down the Bundler Sponsored Operations header path, which
only accepts a BSO-type policy. Base now runs through the ERC-7677 paymaster
path the app already uses for Polygon, with the policy the team already has.

Decision record: `docs/adr/ADR-2026-09-06-base-sponsorship-via-paymaster.md`
and its plain-English companion. Plan:
`docs/plans/2026-09-06-base-sponsorship-via-paymaster-plan.md`.

## What changed

- `config/alchemy-bso-evm-networks.json`: `base-mainnet` is
  `sponsorshipMode: "paymaster"`.
- `lib/server/alchemy-bundler.ts`: in paymaster mode the policy comes from
  the network's own variable, `ALCHEMY_GAS_POLICY_ID` for Base and
  `ALCHEMY_POLYGON_GAS_POLICY_ID` for Polygon; a missing policy fails closed
  with a 424 that names the network.
- The browser's sending code is unchanged; its paymaster branch is the code
  Polygon runs in production.

## Verification

- Red then green: the registry reports Base as paymaster; a Base
  `pm_getPaymasterStubData` call carries `ALCHEMY_GAS_POLICY_ID` in its
  context and no bundler header; a missing policy answers 424 without
  contacting Alchemy; Polygon's case unchanged.
- Cause confirmed against Alchemy directly: the configured policy answers
  `pm_getPaymasterStubData` (a paymaster address and data are returned) and
  rejects the bundler header path.
- `./scripts/preflight.sh` in full.

## Scenario impact

`updated`: "buy Kash+" and every other sponsored send on Base now show two
paymaster calls before the send in the network panel. Reversal is one line in
the registry once a BSO-type policy exists.
