# ADR: Sponsor Base gas through Pimlico instead of Alchemy's Gas Manager

- **Status:** Accepted 2026-11-24 by the maintainer ("Base gas should be
  through Pimlico")
- **Deciders:** the maintainer
- **Base branch:** `main`
- **Plan:** [2026-11-16-base-sponsorship-via-pimlico-plan](../plans/2026-11-16-base-sponsorship-via-pimlico-plan.md)
- **Related:** [ADR-2026-11-24-base-gas-balance](./ADR-2026-11-24-base-gas-balance.md)
  (the user-paid fallback, separate PR)

## Context

Every sponsored send on Base (buys, sells, real-asset trades, Kash, the
migration sweep, bank withdrawals) goes through an EIP-7702 smart account
and a bundler. Today that bundler and paymaster is Alchemy's Gas Manager,
reached through `/api/alchemy-bundler/[network]` with the Alchemy key pool.

Alchemy's Gas Manager was the cost driver. Turning sponsorship off
(`daed696c`) was tried and reverted, because it pushed gas onto every user.
Pimlico fronts gas at cost plus 10% with no monthly minimum, and speaks the
standard ERC-7677 paymaster calls.

## Decision

Only Base's bundler and paymaster traffic moves to Pimlico. Base's ordinary
RPC reads and every other network are unchanged.

```
sendSponsoredEvmCallsWithReceipt (lib/trade/sponsor.ts)
        │ bundlerPathFor(target)
        ├── base-mainnet (provider: "pimlico") ──► /api/pimlico-bundler/base-mainnet
        │        ERC-7677: pm_getPaymasterStubData / pm_getPaymasterData     │
        │        via viem createPaymasterClient                              ▼
        │                                       lib/server/pimlico-bundler.ts ──► api.pimlico.io/v2/8453/rpc
        └── every other network ───────────────► /api/alchemy-bundler/<network> (unchanged)
```

- **Registry:** an optional per-network `provider` field
  (`"alchemy" | "pimlico"`, default `"alchemy"`). `base-mainnet` gets
  `provider: "pimlico"` and `sponsorshipMode: "paymaster"`.
- **`lib/server/pimlico-bundler.ts`:**
  - session-gated;
  - allow-lists the UserOperation and paymaster methods;
  - has one key (`PIMLICO_API_KEY`), not a pool;
  - adds `sponsorshipPolicyId` to paymaster calls when
    `PIMLICO_SPONSORSHIP_POLICY_ID` is set;
  - answers 503 without the key, and never calls Pimlico unauthenticated;
  - passes Pimlico's own errors through.
- **`lib/trade/sponsor.ts`:** picks the proxy with `bundlerPathFor(target)`.
  The Pimlico path uses viem's ERC-7677 paymaster client, because Pimlico
  doesn't implement Alchemy's `alchemy_requestGasAndPaymasterAndData`.
- **Env:** `PIMLICO_API_KEY` is required for Base to sponsor;
  `PIMLICO_SPONSORSHIP_POLICY_ID` is optional.

## Consequences

- Base gas costs follow Pimlico's actual-cost pricing. Users still pay
  nothing on Base, and the gas-balance notice stays hidden.
- Base sponsorship now depends on one Pimlico key and its balance. If it
  runs dry, Base sends fail with Pimlico's error. The fallback is
  `gasPolicy: false` for Base, which switches on the user-paid gas-balance
  UI.
- Two bundler integrations to maintain while the other networks stay on
  Alchemy.

## Alternatives considered

- **Stay on Alchemy's Gas Manager:** rejected on cost.
- **Users pay Base gas themselves:** tried (`daed696c`) and reverted.
- **A treasury-funded ETH drip to every wallet:** rejected earlier on cost
  and complexity.
