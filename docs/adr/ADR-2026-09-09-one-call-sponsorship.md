# ADR-2026-09-09: One Gas Manager call per sponsored send

## Status

Proposed — 2026-09-09. Awaiting the maintainer's approval; the branch is
built and tested so the approval can be made against working code.

## Context

A screen recording of a memecoin buy on production (2026-09-08) showed
twelve to fifteen `base-mainnet` rows in the Network tab for one trade, and
the same again for the sale. The audit traced them to the sponsored send in
`lib/trade/sponsor.ts`. Per user operation, the generic viem path cost:

| step                                                        | calls  |
| ----------------------------------------------------------- | ------ |
| is the wallet delegated (`eth_getCode`), by us              | 1      |
| is the wallet deployed (`eth_getCode`), by viem again       | 1      |
| latest block + chain priority fee (node)                    | 1      |
| bundler priority-fee floor (`rundler_maxPriorityFeePerGas`) | 1      |
| paymaster stub (`pm_getPaymasterStubData`)                  | 1      |
| gas estimate (`eth_estimateUserOperationGas`)               | 1      |
| paymaster data (`pm_getPaymasterData`)                      | 1      |
| account nonce (`eth_call`)                                  | 1      |
| send (`eth_sendUserOperation`)                              | 1      |
| receipt polls, at once and then every 4 s                   | 2 to 4 |

A Base memecoin trade is two operations (approval, then swap), so about
twenty-two calls, plus the two balance reads that prove delivery.

Alchemy's Gas Manager exposes `alchemy_requestGasAndPaymasterAndData`. Given
the sender, nonce, calldata, a stub signature and, for an undelegated wallet,
the EIP-7702 authorization, it answers with every gas limit, both fees and
the paymaster fields in one round trip, for EntryPoint v0.6, v0.7 and v0.8.
It is the call Alchemy's own SDK middleware makes. The fees it returns are
the bundler's own, so the Arbitrum floor problem that ADR-2026-09-07 solved
with an extra call is solved at the source.

## Decision

1. `lib/trade/gas-manager.ts`: `requestGasAndPaymaster()` makes the one call
   through the existing bundler proxy and parses the answer strictly (every
   gas field present and hex, a paymaster address, v0.7+ shape). A missing
   field is an error, never a zero.
2. `lib/trade/delegation.ts`: the delegation check is memoised per wallet
   and chain for the life of the page. It is read once, and a send that
   carried an authorization records the delegation once its receipt lands.
   `account.isDeployed` is pinned to the known answer so viem does not read
   the code a second time.
3. `lib/trade/sponsor.ts`: the send issues the delegation check and the
   nonce read together (one JSON-RPC batch), asks the Gas Manager once, then
   hands viem a fully filled user operation. viem's preparation step only
   estimates what is missing, so it signs and sends without another call.
   The receipt is first looked for after one Base block (2 s), then every
   3 s, instead of at once and every 4 s. The on-chain recovery scan after a
   timeout is unchanged.
4. `lib/server/alchemy-bundler.ts`: `alchemy_requestGasAndPaymasterAndData`
   joins the allowlist and is treated as a policy-bearing call. The proxy
   writes the pair's policy into the request object, replacing anything the
   browser sent, so the policy stays a server secret and the key-pool
   walk (ADR-2026-09-07-alchemy-key-pool) applies unchanged.
5. `lib/trade/sponsor-fees.ts` and its test are removed; nothing calls them.
   ADR-2026-09-07-paymaster-priority-fee-floor is superseded by this one.
6. `features/trade/hooks/use-meme-trade.ts`: the trade service status poll
   looks at 2 s, then 3, 5 and 8 s apart, instead of every 4 s. This is our
   own API, not RPC, but it was the other timer in the flow.
7. Delivery is proven from the receipt, not from balance reads. The
   bundler's receipt lists the operation's own logs; `lib/meme/delivery.ts`
   sums the bought token's ERC-20 Transfer events into the wallet, which is
   exactly what the swap paid out. `sendSponsoredEvmCallsWithReceipt()` and
   `useEvmSendWithReceipt()` hand those logs back; `useEvmSend()` keeps its
   hash-only shape for every other caller. The two `balanceOf` reads around
   the trade are gone. A send that came back without a receipt (the
   user-paid fallback, or a hash recovered from the EntryPoint event) proves
   nothing, and the service's status decides as it did before #392.

After the change, one sponsored send costs:

| step                                                        | calls  |
| ----------------------------------------------------------- | ------ |
| delegation + nonce, one batch (first send only: delegation) | 1      |
| Gas Manager (`alchemy_requestGasAndPaymasterAndData`)       | 1      |
| send (`eth_sendUserOperation`)                              | 1      |
| receipt, first look after one block, then every 3 s         | 1 to 3 |

Four to six per operation; eight to ten per two-call trade, with no balance
reads, down from about twenty-two. Measured on the dev server before the
receipt-log change: 11 rows for a buy; without its two balance reads, 9.

```
browser                    /api/evm-rpc (ZeroDev)     /api/alchemy-bundler (Alchemy)
  |                              |                             |
  |-- eth_getCode + eth_call --->|  (one batch, code once)     |
  |<-----------------------------|                             |
  |-- alchemy_requestGasAndPaymasterAndData ------------------>|  proxy adds policyId
  |<----------------------------------------------------------- |  gas, fees, paymaster
  |   sign typed data (Privy)                                   |
  |-- eth_sendUserOperation ---------------------------------->|
  |<----------------------------------------------------------- |  opHash
  |   wait one block                                            |
  |-- eth_getUserOperationReceipt ---------------------------->|  every 3 s
  |<----------------------------------------------------------- |  txHash
```

## Why not a block ticker

The maintainer suggested driving the flow from `useBlockNumber({ watch:
true })`. A ticker is itself a poll; it only saves calls when several
consumers share it. During a trade nothing else on the page reads the chain,
so a block-driven receipt wait would add a block read per tick on top of
each receipt look. The receipt poll stays a plain timer, aligned to the
block time. The shared ticker in `hooks/use-base-block.ts` remains for the
casino screens, where it does have several consumers.

## Alternatives looked at

- **Alchemy Wallet API** (`wallet_prepareCalls`, `wallet_sendPreparedCalls`,
  `wallet_getCallsStatus`): three round trips per trade with approval and
  swap batched, and no node reads at all. Not cheaper: 1,750 + 3,000
  compute units per send against 1,000 + 1,000 here, and 15,000 on the send
  that carries a sponsored delegation. It also only delegates to Alchemy's
  Modular Account v2, so every wallet would sign a new authorization and
  every sponsored flow (casino, perps, RWA) would move with it. A migration,
  not an optimisation.
- **Privy native sponsorship** (`sendTransaction(…, { sponsor: true })`,
  `wallet_sendCalls`): the browser would make no bundler or paymaster calls;
  Privy runs them behind its own `rpc` endpoint and bills the gas plus its
  fee. It delegates the wallet to a Kernel account, so the same migration
  applies, and the Alchemy key pool would stop mattering for sends. Worth a
  pricing conversation; not a code change to make on the way to a fix.
- **Batching approval and swap into one operation** on the current path:
  one Gas Manager call, one signature, one send, one receipt per trade,
  about 2,000 compute units instead of 4,000 and four rows instead of nine.
  `useEvmSendBatch()` already exists for it. Blocked only by the trade
  service wanting one hash per call index; if it accepts the same hash for
  both, this is a small follow-up.

## Consequences

- One Alchemy call replaces six per operation. The proxy's key-pool walk and
  cooldowns cover the new method exactly as they covered `pm_*`.
- A wallet's first sponsored send still reads its code; every later send on
  that chain in the same page does not. A page reload forgets, which costs
  one read.
- The Gas Manager's answer is trusted for fees. If it ever answers below the
  bundler's floor the send fails at precheck, as it did on Arbitrum before
  ADR-2026-09-07; the error is surfaced, not masked.
- `pm_getPaymasterStubData`, `pm_getPaymasterData` and
  `rundler_maxPriorityFeePerGas` stay on the allowlist for now; nothing in
  the app calls them after this change, and they can be removed in a
  follow-up once production has run on the new path.
- Verification: `lib/trade/sponsor.test.ts` runs the real send against a
  fake fetch and pins the exact JSON-RPC methods per endpoint, for a
  delegated wallet, an undelegated wallet, a second send and a slow
  receipt. `lib/server/alchemy-bundler.test.ts` proves the policy is
  injected and a client-sent one discarded, on Base and Polygon.
