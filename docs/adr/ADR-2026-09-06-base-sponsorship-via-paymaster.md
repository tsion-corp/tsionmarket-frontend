# ADR-2026-09-06: Sponsor Base transactions through the paymaster path

## Status

Accepted — 2026-09-06. Approved by the maintainer in the working session.

## Context

Every gasless transaction on Base (Kash purchases, RWA buys, sponsored swaps)
goes through `app/api/alchemy-bundler/base-mainnet`, which relays user
operations to Alchemy under a Gas Manager policy. The app supports two ways of
naming that policy, chosen per network in `config/alchemy-bso-evm-networks.json`:

- **`bso`** (Bundler Sponsored Operations): the policy id travels in an
  `x-alchemy-policy-id` header on `eth_sendUserOperation`, and the browser
  zeroes `maxFeePerGas`, `maxPriorityFeePerGas` and `preVerificationGas`. Base
  uses this today, reading `ALCHEMY_GAS_POLICY_ID`.
- **`paymaster`** (ERC-7677): the browser asks `pm_getPaymasterStubData` and
  `pm_getPaymasterData`, and the proxy injects the policy id into the request
  context. Polygon uses this today, reading `ALCHEMY_POLYGON_GAS_POLICY_ID`.

On 2026-09-06 Kash purchases failed. The proxy now logs the bundler's answers
(PR #383), and the log named the cause exactly:

```
eth_sendUserOperation -> -32602
"Policy with ID '97312e13-…' does not support bundler sponsorship"
```

The configured policy is a paymaster-type policy. Probed directly, it answers
the paymaster path: `pm_getPaymasterStubData` with this policy in the context
returns a paymaster address and data (sponsor "Chukwura's First App - Gas
Policy"), and the legacy `alchemy_requestGasAndPaymasterAndData` returns an
ordinary validation error rather than "unsupported". It is a valid, funded
sponsorship policy of the wrong kind for the header path. Two policies created
from the dashboard in one afternoon both came out this way, and Alchemy's
documentation does not spell out which dashboard label produces a
BSO-capable one.

The credentials themselves are now correct: the key authenticates and the
account has capacity (an earlier, separate failure was exhausted monthly
capacity; that is resolved).

## Decision

Run Base sponsorship through the paymaster path, the way Polygon already runs,
using the policy the team already has:

1. `config/alchemy-bso-evm-networks.json`: `base-mainnet` gains
   `"sponsorshipMode": "paymaster"`.
2. `lib/server/alchemy-bundler.ts`: in paymaster mode the policy id comes from
   the network's own variable, `ALCHEMY_GAS_POLICY_ID` for Base and
   `ALCHEMY_POLYGON_GAS_POLICY_ID` for Polygon, instead of always the Polygon
   one. A missing policy fails closed with a 424 that names the network.
3. No change to `lib/trade/sponsor.ts`: its paymaster branch
   (`createPaymasterClient`, `sendUserOperation({ calls, authorization })`) is
   the code Polygon runs in production, including the EIP-7702 authorization.

Reversal is one line: set Base back to `bso` once a Bundler Sponsored
Operations policy exists, if the team wants BSO's faster execution and
automatic retries.

### Alternatives considered

- **Create a BSO-capable policy in the dashboard.** The right long-term
  answer if BSO is wanted, but two attempts produced paymaster policies and
  the documentation does not say which option yields BSO. This decision does
  not preclude it; it makes purchases work with what exists.
- **Try both paths at runtime.** Doubles the surface on a money path and
  hides configuration mistakes behind a fallback. Rejected.
- **Leave Base on BSO and wait.** Every gasless transaction on Base stays
  broken meanwhile. Rejected.

## Consequences

- Base sponsored sends work with the current policy. The browser makes two
  extra paymaster calls per user operation (`pm_getPaymasterStubData`,
  `pm_getPaymasterData`), as Polygon does; BSO's zero-gas shortcut and its
  faster bundler execution are given up until a BSO policy exists.
- The proxy's paymaster branch is no longer Polygon-specific. Its tests gain
  a Base case.
- `ALCHEMY_GAS_POLICY_ID` must be the paymaster-type policy's id in every
  environment (it already is locally); nothing else changes in Vercel.
- Scenario impact: `updated` for "buy Kash+" and every other sponsored send on
  Base: the network panel shows the paymaster calls, and a policy problem
  reports through them.

## Verification plan

1. Red: registry test that Base is `paymaster`; proxy test that a Base
   `pm_getPaymasterStubData` call gets `ALCHEMY_GAS_POLICY_ID` in its context
   and that a missing policy fails closed with 424; both fail today.
2. Green: the registry flag and the per-network policy lookup.
3. `./scripts/preflight.sh` in full.
4. Local dev server: a real Kash purchase; the proxy log shows the paymaster
   calls answered without error and the send confirmed.
