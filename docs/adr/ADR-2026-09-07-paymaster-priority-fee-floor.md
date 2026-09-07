# ADR-2026-09-07: Sponsored sends take the bundler's priority-fee floor

## Status

Accepted — 2026-09-07. The maintainer asked for this one fix to go to
`main` now, ahead of the day's other changes.

## Context

A sponsored send on Arbitrum answered, through
`POST /api/alchemy-bundler/arb-mainnet` (HTTP 200, JSON-RPC error inside):

```
-32000 precheck failed: maxPriorityFeePerGas is 0 but must be at least 831187
```

On the paymaster path (`lib/trade/sponsor.ts`) viem estimates the user
operation's fees from the chain: `eth_maxPriorityFeePerGas` plus the latest
base fee. Probed live: Arbitrum's node answers `0x0` for the priority fee,
which is correct for the chain, and Alchemy's bundler enforces its own floor,
published as `rundler_maxPriorityFeePerGas`: 1,103,080 wei on Arbitrum,
1,000,000 on Base, 30 gwei on Polygon at the time of the probe. Base and
Polygon nodes already estimate above their floors, which is why only Arbitrum
failed. The bundler proxy also did not allow the `rundler_` method through.

## Decision

1. `lib/trade/sponsor-fees.ts`: `paymasterFeesPerGas()` asks the bundler for
   `rundler_maxPriorityFeePerGas`, adds 25% headroom, and uses the larger of
   that and the chain's own estimate as the tip; the max fee is twice the
   latest base fee plus the tip, Alchemy's own guidance. A bundler that
   publishes no floor falls back to the chain's estimate, with a warning.
2. `lib/trade/sponsor.ts`: the paymaster branch passes that estimator to
   viem's bundler client (`userOperation.estimateFeesPerGas`). The BSO branch
   is unchanged (it zeroes fees on purpose).
3. `lib/server/alchemy-bundler.ts`: `rundler_maxPriorityFeePerGas` joins the
   allowed methods, without a policy or header.

### Alternatives considered

- **Hard-code a minimum tip per chain.** Floors move with the market; the
  bundler publishes the live value.
- **Set a large fixed tip.** Sponsorship pays it; on Polygon that is real
  money per operation.

## Consequences

- One extra bundler call per sponsored send (`rundler_maxPriorityFeePerGas`,
  a few CU), on every paymaster chain.
- Arbitrum sponsored sends pass precheck; Base and Polygon behave as before
  since their chain estimates already exceed the floor.
- Scenario impact: `none` visible; the Arbitrum sell completes instead of
  failing.

## Verification plan

Red: the fee helper yields a zero tip on a zero chain estimate; the proxy
refuses the `rundler_` method. Green: helper, wiring, allowlist. Preflight in
full. After deploy: the reported Arbitrum sell.
