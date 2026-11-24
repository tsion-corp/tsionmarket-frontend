---
date: 2026-11-24
branch: feat/base-sponsorship-pimlico
base: main
scenario-impact: updated
---

# Base gas is sponsored through Pimlico

Sponsored sends on Base now go through Pimlico's bundler and paymaster
(`/api/pimlico-bundler/base-mainnet`) instead of Alchemy's Gas Manager. This
covers buys, sells, real-asset trades, Kash and bank withdrawals
([ADR](../adr/ADR-2026-11-24-base-sponsorship-via-pimlico.md)).

Users notice nothing; Base actions stay gas-free. Every other network still
sponsors through Alchemy, and Base's ordinary reads are unchanged.

## Configuration

- `PIMLICO_API_KEY` (server-only) must be set wherever the app runs. Without
  it the Pimlico proxy answers 503 and Base sends fail.
- `PIMLICO_SPONSORSHIP_POLICY_ID` is optional and scopes sponsorship to a
  Pimlico policy.

## Verified

- Tests for the Pimlico proxy, provider routing in `lib/trade/sponsor.ts`,
  the registry's `provider` field and the Alchemy proxy.
- The key answers on Base (`eth_supportedEntryPoints` lists the v0.8
  EntryPoint the app uses; `pimlico_getUserOperationGasPrice` answers).

Not verified: a real sponsored UserOperation. That needs a signed-in wallet,
so the first real Base action after deploy is the end-to-end check.
Scenario automation for Base sends needs updating to expect the Pimlico
proxy.
