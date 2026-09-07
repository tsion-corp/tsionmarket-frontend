# Plan: sponsor every EVM mainnet the policy covers

Decision: `docs/adr/ADR-2026-09-07-sponsor-all-evm-mainnets.md`.
Branch: `fix/sponsor-all-evm-mainnets`, off `origin/main`.

## Scope

Registry flags and the two tests that encode the sponsored set. No code path
changes: the proxy (since #385) and the browser's paymaster branch already
serve any paymaster-mode network.

## Steps

1. **Probe.** For every mainnet entry in `config/alchemy-bso-evm-networks.json`:
   `eth_chainId` through the key (reachability), then `pm_getPaymasterStubData`
   with the production policy id (coverage). Record the table in the ADR.
2. **Red.** `lib/trade/sponsored-evm.test.ts`: the 23-network list, the exact
   flagged set, the paymaster-mode and read-client invariants; testnets,
   unreachable mainnets and `edge-mainnet` stay false. `lib/trade/gas-buffer.test.ts`:
   zero reserve on the sponsored mainnets, reserve kept on `arbnova-mainnet`
   and a testnet. Run: fail against the two current flags.
3. **Green.** Registry: `"sponsorshipMode": "paymaster", "gasPolicy": true` on
   each of the 23.
4. **Release note.** `docs/release-notes/2026-09-07-sponsor-all-evm-mainnets.md`,
   `scenario-impact: updated`.
5. **Verify.** `./scripts/preflight.sh` in full. After deploy: the reported
   Arbitrum USDC sell from a wallet holding no ETH.
6. **Deliver.** PR against `main` with the governance template.

## Interface contracts

- Registry: `gasPolicy` and `sponsorshipMode` per entry, unchanged types.
- Environment: `ALCHEMY_GAS_POLICY_ID` is the policy for every paymaster
  network except Polygon; unchanged.

## Out of scope

Per-network spending caps (Alchemy dashboard); runtime policy discovery;
any change to the send code.
