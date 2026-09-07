# Plan: sponsored Solana memecoin trading

Implements ADR-2026-09-06-solana-memecoin-trading (approved 2026-09-06).

## Boundaries

| module                                                      | change                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/meme/chain.ts` (new)                                   | Pure: `BASE_CHAIN_ID`, `SOLANA_CHAIN_ID`, `SUPPORTED_CHAIN_IDS`, `chainSlug(chainId)` → `"base" \| "solana"`, `networkOf(chainId)` → portfolio network key, `USDC_BY_CHAIN`.                                                                                                                       |
| `lib/meme/catalog.ts`                                       | `tradableHere` keeps every supported chain and drops the quote currency on each. Replaces the Base-only scoping.                                                                                                                                                                                   |
| `lib/meme/api.ts`                                           | `fetchToken` / `fetchTradability` take `chainId` and name the chain. Solana client: `createSolanaWalletChallenge`, `verifySolanaWallet`, `previewSolanaSwap`, `quoteSolanaSwap`, `registerSolanaSubmission`. `PreparedSolanaSwap` type. `SwapRequest` unchanged; `MemeTradeInput` gains `chainId`. |
| `lib/api/schemas/trade.ts`                                  | `solana/swaps/quote` schema.                                                                                                                                                                                                                                                                       |
| `lib/meme/solana-signature.ts` (new)                        | Pure: `signatureToBase58(bytes)`; guards the 64-byte length the contract requires.                                                                                                                                                                                                                 |
| `features/trade/hooks/use-meme-trade.ts`                    | Chain branch on `input.chainId`. Solana: link via `useSignMessage` (solana), quote → `useSponsoredSolanaSend` → `registerSolanaSubmission` → shared status poll. Exposes `walletFor(chainId)`.                                                                                                     |
| `features/trade/hooks/use-meme-tokens.ts`                   | `useMemeToken(address, chainId)`.                                                                                                                                                                                                                                                                  |
| `features/trade/components/meme-trade-sheet.tsx`            | Balances and wallet keyed on the token's chain; USDC of that chain; preview routed by chain.                                                                                                                                                                                                       |
| `features/trade/components/buy-sheet.tsx`, `spot-panel.tsx` | Pass `chainId: BASE_CHAIN_ID` (both are Base swap routes).                                                                                                                                                                                                                                         |
| `lib/server/dashboard-feed.ts`                              | Uses the shared `tradableHere`; no other change.                                                                                                                                                                                                                                                   |

## Interface contracts

```ts
interface MemeTradeInput extends Omit<SwapRequest, "walletAddress"> {
  chainId: number;
}
interface PreparedSolanaSwap {
  swapId: string;
  unsignedTransactionBase64: string;
  platformFeeTokenAddress: string | null;
  platformFeeAmountAtomic: string;
  expiresAt: string;
}
```

Solana wallet link: `POST /solana/wallets/challenges { walletAddress }` →
sign `message` bytes with Privy → base58(64-byte sig) →
`POST /solana/wallets/verify { challengeId, signature }`.

Execution: quote → `sendSponsored({ transaction: unsignedTransactionBase64, wallet, prefundRent: false })`
→ signature → `POST /solana/swaps/{swapId}/submissions { walletAddress, signature }` → poll `/swaps/{id}/status`.

## State

`TradePhase` unchanged. `settled` carries `{ txHash: signature, chainId: 101 }` for Solana. `received` (the balance-delta proof) stays Base-only in this change; Solana shows CONFIRMED only.

## Test strategy (Red-Green, Directive 3)

- `lib/meme/chain.test.ts`: slugs, networks, supported set.
- `lib/meme/api.chain.test.ts`: Solana rows kept; chain 1 dropped; detail names `chain=solana` for 101; Solana quote hits `/solana/swaps/quote`; submission body shape.
- `lib/meme/solana-signature.test.ts`: base58 round trip; rejects wrong length.
- `lib/api/schemas/trade.test.ts` (or existing): Solana quote schema accepts the contract shape, rejects a missing transaction.
- `lib/server/dashboard-feed.test.ts`: Solana row now reaches the brief.

## UI

No new screens. The existing sheet renders for both chains; copy that says "Base" becomes chain-aware.
