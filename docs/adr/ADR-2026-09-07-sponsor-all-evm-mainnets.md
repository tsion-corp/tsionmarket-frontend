# ADR-2026-09-07: Sponsor every EVM mainnet the policy covers

## Status

Accepted — 2026-09-07, on the maintainer's instruction: "all evm chains".
The cost consequence for Ethereum mainnet was raised first and the
instruction was reaffirmed.

## Context

A user could not sell USDC on Arbitrum on production. The sell sheet showed
"Your Arbitrum wallet needs a little ETH before it can send" and disabled the
button. The team's first reading was an exhausted sponsorship budget; the
Alchemy dashboard showed budget remaining.

The cause is in the app. PR #343 (2026-09-03) made sponsorship opt-in per
chain with a `gasPolicy` flag in `config/alchemy-bso-evm-networks.json` and
set it on Base and Polygon only, on the stated assumption that "an Alchemy Gas
Manager policy covers one network and we hold two". Every reader of the flag
(`hooks/use-evm-send.ts`, the sell sheet, the spot panel, `lib/trade/gas-buffer.ts`,
the RWA presenter) treats an unflagged chain as user-paid: the sell sheet
checks the wallet for the native token, finds none, and refuses without ever
contacting Alchemy. The dashboard's remaining balance is irrelevant to the
failure.

The assumption is false for the policy in use. Probed on 2026-09-07 with the
production policy id through `pm_getPaymasterStubData`, one policy answers with
a paymaster on every mainnet the API key can reach:

| network             | chain id | answer                    |
| ------------------- | -------- | ------------------------- |
| eth-mainnet         | 1        | sponsored                 |
| base-mainnet        | 8453     | sponsored                 |
| arb-mainnet         | 42161    | sponsored                 |
| apechain-mainnet    | 33139    | sponsored                 |
| berachain-mainnet   | 80094    | sponsored                 |
| bnb-mainnet         | 56       | sponsored                 |
| celo-mainnet        | 42220    | sponsored                 |
| cronos-mainnet      | 25       | sponsored                 |
| edge-mainnet        | 3343     | sponsored (but see below) |
| frax-mainnet        | 252      | sponsored                 |
| gensyn-mainnet      | 685689   | sponsored                 |
| hyperliquid-mainnet | 999      | sponsored                 |
| ink-mainnet         | 57073    | sponsored                 |
| monad-mainnet       | 143      | sponsored                 |
| opbnb-mainnet       | 204      | sponsored                 |
| opt-mainnet         | 10       | sponsored                 |
| plasma-mainnet      | 9745     | sponsored                 |
| polygon-mainnet     | 137      | sponsored                 |
| robinhood-mainnet   | 4663     | sponsored                 |
| shape-mainnet       | 360      | sponsored                 |
| soneium-mainnet     | 1868     | sponsored                 |
| stable-mainnet      | 988      | sponsored                 |
| unichain-mainnet    | 130      | sponsored                 |
| worldchain-mainnet  | 480      | sponsored                 |
| arbnova-mainnet     | —        | key has no access         |
| polynomial-mainnet  | —        | key has no access         |

Since ADR-2026-09-06-base-sponsorship-via-paymaster the proxy already sends
every paymaster-mode network's policy from `ALCHEMY_GAS_POLICY_ID` (Polygon
keeps its own variable), and the browser's paymaster branch is the one Polygon
runs in production. Nothing new is needed on the wire.

## Decision

Flag every mainnet that meets all three conditions as sponsored, in paymaster
mode:

1. the API key can reach it (`eth_chainId` answers);
2. the policy answers `pm_getPaymasterStubData` for it;
3. the app has a read client for it (`chainKey` set, so `supportsReceiptPolling`
   is true). `sendSponsoredEvmCalls` refuses a chain without one, so flagging
   such a chain would fail every sell rather than fall back.

That is the 23 networks above minus `edge-mainnet` (no viem chain). Excluded,
and staying user-paid: `arbnova-mainnet` and `polynomial-mainnet` (no key
access), `edge-mainnet`, and every testnet (no policy applies to them in
production; the app holds no balances there).

The registry test becomes the source of truth for this list and enforces two
invariants: every flagged chain is paymaster mode, and every flagged chain has
a read client.

### Alternatives considered

- **Arbitrum only.** Fixes the report, leaves the same defect on every other
  chain a user can hold a balance on (HyperEVM's HYPE sell was the report that
  produced #343). The maintainer chose all chains.
- **Flag every registry entry.** Would flag chains the key cannot reach and
  testnets; a sponsored send there fails where a user-paid one would work.
- **Decide at runtime by probing the policy per chain.** Adds a network round
  trip and a cache to a money path to answer a question whose answer changes
  only when someone edits the policy in the dashboard. A static list plus a
  test is the same information with no runtime cost.

## Consequences

- Sells, RWA buys and every other sponsored send work without native gas on
  all 23 mainnets. The "needs a little ETH" message no longer appears on them,
  and a max sell of a chain's native token sells the full balance.
- **Budget.** Every one of these chains draws from the same policy budget.
  Ethereum mainnet in particular can spend more on one transaction than the
  L2s do in hundreds; the maintainer accepted this. Exhaustion is reported
  honestly since #383, and the Alchemy dashboard's spending rules are the
  place to cap it per network.
- **EIP-7702.** The sponsored path delegates the embedded wallet with an
  EIP-7702 authorization. Ethereum, Base, Arbitrum, Optimism, Polygon, BNB,
  Unichain, World Chain, Ink, Soneium, Shape, Frax and Monad support it. For
  the remaining chains the first real send is the verification; a rejection is
  logged by the proxy with Alchemy's own message (`Alchemy bundler <network>:
eth_sendUserOperation answered an error`) and reverting one chain is one
  flag.
- `lib/trade/gas-buffer.ts`'s sized reserves for eth, arb, opt, polygon and
  HyperEVM become dormant; they are kept for the day a policy lapses.
- Tests that encoded the old two-chain decision (`sponsored-evm.test.ts`,
  `gas-buffer.test.ts`) are rewritten to the new one; none is deleted.
- Scenario impact: `updated` for spot sell and RWA buy on every newly
  sponsored chain.

## Addendum, 2026-09-07 afternoon: what the first sends showed

The first real HYPE sell on HyperEVM after this change failed with the
bundler's "Invalid fields set on User Operation" (the same answer PR #343
fixed by making HyperEVM user-paid). Probed directly against Alchemy's
bundler on every flagged chain with a user operation carrying an EIP-7702
authorization (`eth_estimateUserOperationGas` on entry point v0.7):

| chain               | answer                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| hyperliquid-mainnet | `EIP-7702 is not supported on entry point 0x…032`                               |
| apechain-mainnet    | `EIP-7702 is not supported on entry point 0x…032`                               |
| opbnb-mainnet       | `EIP-7702 is not supported on entry point 0x…032`                               |
| the other 20        | accept the authorization; fail only at signature validation, as a dummy op must |

The sponsored path delegates the embedded wallet with exactly that
authorization, so on those three chains no sponsored send can ever complete.
Their flags are removed (PR fix/unsponsor-chains-without-7702): HyperEVM,
ApeChain and opBNB send user-paid again, the HyperEVM measured gas reserve is
back, and the sell sheet asks for native gas there as it did before. The
policy still covers them; if Alchemy adds EIP-7702 support on those bundlers
the flag is one line to restore, and this probe is the check to run first.

## Verification plan

1. Red: registry test lists the 23 networks and the two invariants; gas
   buffer test expects zero reserve on them. Both fail against today's two
   flags.
2. Green: the registry flags.
3. `./scripts/preflight.sh` in full.
4. Production after deploy: the reported USDC sell on Arbitrum from a wallet
   with no ETH completes; the proxy log shows the two paymaster calls and the
   accepted send.
