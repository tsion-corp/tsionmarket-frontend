# Plan: revert the Base user-paid flip, sponsor Base through Pimlico

Decision: `docs/adr/ADR-2026-11-16-base-sponsorship-via-pimlico.md` (to write
alongside this plan, same convention as
`ADR-2026-09-06-base-sponsorship-via-paymaster.md`).
Branch: `feat/base-sponsorship-pimlico`, off latest `origin/main` (not stacked
on `feat/base-gas-balance` — the gas-balance display/warning/auto-top-up work
on that branch stays; only the sponsorship-off commit is undone).

## Background

`feat/base-gas-balance` carries two commits:

- `2f764ed6` / `479e82ea` — the gas-balance display, warning and auto-top-up.
  **Keep.** Still useful cushioning even with Base sponsored again.
- `daed696c` "Stop sponsoring Base sends; users now pay their own gas there"
  — flips `base-mainnet` to user-paid in
  `config/alchemy-bso-evm-networks.json` and updates 9 test files. **Revert.**
  Decided against after pricing out the alternative: Alchemy's Gas Manager
  was the cost driver, not sponsorship itself, and Pimlico fronts gas at
  actual cost + 10% with no monthly minimum — cheaper than building a
  treasury-funded drip service or pushing gas onto 4k+ users.

## Scope

Revert one commit's config/test changes. Add one new bundler provider
(Pimlico) alongside Alchemy, selected per network in the existing registry,
so only Base's _bundler/paymaster_ traffic moves — Base's ordinary RPC reads
stay on `alchemyHost` (`app/api/evm-rpc/[network]`), untouched. No change to
`lib/trade/gas-reserve.ts`, `GasTopUpHost`, or the portfolio gas-balance UI.

## Steps

1. **Revert the flip.**
   - `git revert daed696c` (or hand-revert if conflicts with later work):
     restores `base-mainnet`'s `sponsorshipMode: "paymaster"` /
     `gasPolicy: true` in `config/alchemy-bso-evm-networks.json`, and restores
     the 9 test files it touched (`rwa-presenter.test.ts`,
     `move-funds.test.ts`, `sponsor.test.ts`, `gas-buffer.test.ts`,
     `sponsored-evm.test.ts`, `plan.test.ts`, `holdings.test.ts`,
     `use-spot-sell.test.tsx`, `alchemy-bundler.test.ts`,
     `use-evm-send.test.ts`, `holdings-modal.test.tsx`).
   - Full suite green before moving on — this step is a pure revert and
     should not need new fixtures.

2. **Red.**
   - `lib/trade/sponsored-evm.test.ts`: `base-mainnet` resolves
     `bundlerProvider: "pimlico"`; every other sponsored network still
     resolves `bundlerProvider: "alchemy"` (the field defaults when the
     registry entry omits it).
   - New `lib/server/pimlico-bundler.test.ts`: a Base `pm_getPaymasterStubData`
     / `pm_getPaymasterData` / `eth_estimateUserOperationGas` /
     `eth_sendUserOperation` call is forwarded to
     `https://api.pimlico.io/v2/8453/rpc?apikey=$PIMLICO_API_KEY`; when
     `PIMLICO_SPONSORSHIP_POLICY_ID` is set it's injected as
     `params[3].sponsorshipPolicyId` (Pimlico's own field name — not
     `policyId`); with `PIMLICO_API_KEY` unset the route answers 503 and
     never contacts Pimlico; a Pimlico error response is passed through
     verbatim (status + body), matching `alchemy-bundler.ts`'s
     fail-closed/pass-through shape but with no key pool, no BSO branch, and
     no capacity-cooldown bookkeeping (Pimlico is one key, billed, not a
     shared pool).
   - `lib/trade/sponsor.test.ts`: the bundler transport path is
     `/api/pimlico-bundler/base-mainnet` when the target's
     `bundlerProvider` is `"pimlico"`, `/api/alchemy-bundler/<network>`
     otherwise. (Extract a small `bundlerPathFor(target)` helper so this is
     testable without mocking `viem`'s `http()`.)
   - Run: all fail today (no `bundlerProvider` field, no Pimlico route, no
     `bundlerPathFor`).

3. **Green.**
   - `config/alchemy-bso-evm-networks.json`: add `"provider": "pimlico"` to
     the `base-mainnet` entry. Leave `alchemyHost` as-is — reads keep using
     it.
   - `lib/trade/sponsored-evm.ts`: add `bundlerProvider: "alchemy" |
"pimlico"` to `SponsoredEvmChainConfig`, read from the registry entry's
     new optional `provider` field, defaulting to `"alchemy"`.
   - `lib/server/pimlico-bundler.ts` (new): mirrors
     `forwardAlchemyBundlerRequest`'s auth check, method allowlist and
     error pass-through, but talks to one Pimlico API key — no
     `alchemyPairs()` pool, no BSO branch (Pimlico speaks ERC-7677 paymaster
     calls only), no capacity-cooldown retry loop. Policy id (if any) comes
     from `PIMLICO_SPONSORSHIP_POLICY_ID` and rides in
     `params[3].sponsorshipPolicyId` the way `withPaymasterPolicy` does today
     for Alchemy's `policyId`.
   - `app/api/pimlico-bundler/[network]/route.ts` (new): same shape as
     `app/api/alchemy-bundler/[network]/route.ts`, delegating to
     `forwardPimlicoBundlerRequest`.
   - `lib/trade/sponsor.ts`: replace the hardcoded `BUNDLER_PATH` constant
     with `bundlerPathFor(target)`, returning `/api/pimlico-bundler` or
     `/api/alchemy-bundler` by `target.bundlerProvider`. No other change —
     the paymaster-mode branch (`requestGasAndPaymaster` /
     `sendUserOperation`) is provider-agnostic ERC-7677 already.
   - Env: add `PIMLICO_API_KEY` (required for Base to sponsor) and
     `PIMLICO_SPONSORSHIP_POLICY_ID` (optional — omit to sponsor all traffic
     on the key with no policy scoping) to `.env.example` and the
     environments doc.

4. **Release note.**
   `docs/release-notes/2026-11-16-base-sponsorship-via-pimlico.md`,
   `scenario-impact: updated` for every sponsored send on Base (buy, sell,
   RWA, migration sweep) and for the gas-balance notice (still shown — real
   ETH-on-Base balance is unaffected by who sponsors the bundler, and stays
   as a cushion for any future provider gap).

5. **Verify.** `./scripts/preflight.sh` in full. Dev server with
   `PIMLICO_API_KEY` set to a real pay-as-you-go key: a Kash purchase on
   Base; network log shows `pm_getPaymasterStubData` / `pm_getPaymasterData`
   answered by `api.pimlico.io` without error and `eth_sendUserOperation`
   accepted; the sheet reports success with no wallet gas spent.

6. **Deliver.** PR against `main` with the governance template, noting the
   revert of `daed696c` and the new Pimlico provider in the summary.

## Interface contracts

- Registry: new optional `provider` field per network entry
  (`"alchemy" | "pimlico"`, default `"alchemy"`); `sponsorshipMode` and
  `gasPolicy` unchanged in meaning.
- Environment: `PIMLICO_API_KEY`, `PIMLICO_SPONSORSHIP_POLICY_ID` (optional).
  Existing `ALCHEMY_GAS_POLICY_ID` / `ALCHEMY_POLYGON_GAS_POLICY_ID`
  unchanged — Alchemy keeps sponsoring every other network.
- `lib/trade/sponsor.ts`'s public API (`sendSponsoredEvmCalls`,
  `sendSponsoredEvmCallsWithReceipt`) unchanged; routing is internal.

## Out of scope

- Moving any other network off Alchemy.
- Changing `app/api/evm-rpc/[network]` (ordinary reads) for Base.
- The gas-balance display/warning/auto-top-up feature — already shipped,
  left as-is.
- Building a treasury-funded gas-drip service — explicitly rejected earlier
  on cost grounds; sponsoring via Pimlico removes the reason it was proposed.
- A multi-key Pimlico pool / cooldown system like Alchemy's — one key is in
  scope; revisit only if Pimlico rate limits become a real problem.
