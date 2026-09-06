# Plan: Base sponsorship through the paymaster path

Decision: `docs/adr/ADR-2026-09-06-base-sponsorship-via-paymaster.md`.
Branch: `fix/base-sponsorship-paymaster`, off `origin/main`.

## Scope

One registry entry, one lookup in the bundler proxy, their tests, a release
note. `lib/trade/sponsor.ts` is untouched.

## Steps

1. **Red.**
   - `lib/trade/sponsored-evm.test.ts` (new or extended): `base-mainnet`
     resolves with `sponsorshipMode: "paymaster"`.
   - `lib/server/alchemy-bundler.test.ts`: a Base `pm_getPaymasterStubData`
     call is forwarded with `ALCHEMY_GAS_POLICY_ID` injected as
     `params[3].policyId`; with that variable unset the proxy answers 424 and
     never contacts Alchemy; the existing Polygon case still injects
     `ALCHEMY_POLYGON_GAS_POLICY_ID`.
     Run: all fail today.
2. **Green.**
   - `config/alchemy-bso-evm-networks.json`: add `"sponsorshipMode": "paymaster"`
     to `base-mainnet`.
   - `lib/server/alchemy-bundler.ts`: `paymasterPolicyIdFor(target)` returns
     the Polygon variable for `polygon-mainnet` and `ALCHEMY_GAS_POLICY_ID`
     otherwise; the paymaster branch uses it; the "policy is missing" answer
     names the network.
3. **Release note.**
   `docs/release-notes/2026-09-06-base-sponsorship-via-paymaster.md`,
   `scenario-impact: updated`.
4. **Verify.** `./scripts/preflight.sh` in full. Dev server: a real Kash
   purchase; the proxy log shows `pm_getPaymasterStubData` and
   `pm_getPaymasterData` answered without error and `eth_sendUserOperation`
   accepted; the sheet reports success.
5. **Deliver.** PR against `main` with the governance template.

## Interface contracts

- Registry: `sponsorshipMode` per network, unchanged type.
- Environment: `ALCHEMY_GAS_POLICY_ID` is the Base policy in either mode.
  `ALCHEMY_POLYGON_GAS_POLICY_ID` unchanged.

## Out of scope

Creating a BSO policy; any change to the sending code or to Polygon.
