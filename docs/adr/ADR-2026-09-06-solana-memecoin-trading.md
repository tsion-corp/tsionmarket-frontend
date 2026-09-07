# ADR-2026-09-06: Trade Solana memecoins, sponsored, through the trade service

## Status

Accepted — 2026-09-06. Approved by the maintainer in the working session.

## Context

The trade service now indexes Base and Solana memecoins and executes on
both. Its contract (`llm.txt`, `MEMECOIN_TRADING_FLOW.md`) is chain-aware:
every token carries `chainId + address`, detail routes require `?chain=`,
Base executes as ordered EVM calls and Solana executes as one unsigned
versioned transaction that the gas-sponsor service pays for.

The frontend is Base-only. It has no Solana wallet link, no `/solana/swaps/*`
client, and no submission of a Solana signature. Until PR `fix/meme-scope-to-base`
lands, Solana rows in trending and search are dead cards: the detail call
answers `400 Invalid EVM token`. That PR hides them. This ADR is the feature
that makes them tradable instead.

What already exists, and is used in production today:

| piece                                                         | where                                                                                          | used by                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| Sponsored Solana send: prepare → user signs → sponsor submits | `hooks/use-sponsored-solana.ts`, `lib/trade/solana-sponsor.ts`, `app/api/gas-sponsor/solana/*` | crypto withdrawals, sends |
| Solana embedded wallet + `signTransaction`                    | Privy `@privy-io/react-auth/solana`                                                            | the above                 |
| Solana holdings and balances                                  | portfolio feed                                                                                 | portfolio, sells          |
| EVM wallet link (challenge → `signMessage` → verify)          | `features/trade/hooks/use-meme-trade.ts:75-77`                                                 | Base memecoins            |
| Base memecoin buy/sell state machine                          | `use-meme-trade.ts`, `meme-trade-sheet.tsx`                                                    | `/meme`, spot             |
| Trade proxy with upstream schema validation                   | `app/api/trade/[...path]/route.ts`, `lib/api/schemas/trade.ts`                                 | all of the above          |

Live checks on 2026-09-06: `GET /v1/gas-sponsor/capabilities` reports
`configured: true`, `previewOnly: false`, Privy verification implemented,
sponsor `EBLMEDB15dWkVG9kZhwKwgDbTmcBdCR2tBduZRB7XBZ1`. The Solana catalog,
trending and search all return rows with `chainId: 101`.

## Decision

Make the memecoin trade flow chain-aware, keyed on the token's `chainId`, and
route `101` through the existing sponsored Solana send. Base is untouched.

1. **Identity.** `MemeToken` already carries `chainId`. It becomes the
   routing key everywhere a request is built. No symbol or address-shape
   inference, per the contract.

2. **Discovery.** `lib/meme/catalog.ts` stops dropping Solana rows.
   `fetchToken` and `fetchTradability` name the chain from the token
   (`?chain=base|solana`) instead of hard-coding `base`. The catalog keeps
   its `chain=` filter as a UI choice (a chain toggle on the grid), not as a
   safety net.

3. **Wallet link.** A Solana sibling of the EVM link: `POST
/solana/wallets/challenges` → Privy `useSignMessage` (solana) over the
   returned message → base58-encode the 64-byte signature → `POST
/solana/wallets/verify`. Same one-time-per-wallet caching as EVM. Solana
   addresses are never lowercased.

4. **Preview and quote.** `POST /solana/swaps/preview` and `/solana/swaps/quote`
   with the same `SwapRequest` body, `walletAddress` = the Solana embedded
   wallet. Fresh `Idempotency-Key` per user action, reused only on retry.
   Human-readable `amount`, as today.

5. **Execution.** The quote's `unsignedTransactionBase64` goes straight into
   `useSponsoredSolanaSend`, which already performs prepare → sign → submit
   and returns the on-chain signature. Nothing is rewritten after the user
   signs. `prefundRent` stays `false`; the sponsor decides rent.

6. **Registration and status.** `POST /solana/swaps/{swapId}/submissions`
   `{ walletAddress, signature }`, then poll the shared
   `/swaps/{swapId}/status` until terminal, exactly as Base does. Success is
   `CONFIRMED` only, never the broadcast.

7. **Proxy.** `app/api/trade/[...path]` admits `solana/*` and gains Zod
   schemas for the Solana quote (`swapId`, `unsignedTransactionBase64`,
   `platformFeeTokenAddress`, `platformFeeAmountAtomic`, `expiresAt`) and the
   Solana submission. Upstream payloads still never reach components raw.

8. **Sell.** Amount and Max come from the wallet's SPL balance for the mint,
   from the portfolio feed. No gas is held back: the sponsor pays it.

### Alternatives considered

- **Solana execution in the browser with Jupiter directly.** Rejected: the
  trade service owns risk policy, fees and confirmation, and its quote is
  what the worker verifies. Going around it would bypass every check the
  contract lists.
- **Alchemy Solana sponsorship (`app/api/alchemy-solana-sponsor`).** Exists as
  a legacy route. Rejected for this flow: the contract names the gas-sponsor
  service, and it is the path the trade worker's fee verification assumes
  (sponsor as fee payer, treasury USDC ATA receiving the platform fee).
- **A separate Solana memecoin page.** Rejected: one list, one sheet, one
  state machine with a chain branch is smaller and matches the product
  ("memecoins", not "Base memecoins").

## Consequences

- Solana memecoins become visible and tradable. The Base-only scoping in
  `fix/meme-scope-to-base` is superseded on merge; that PR still ships first
  as the immediate fix.
- `use-meme-trade.ts` gains a chain branch. It is the seam every caller
  already uses, so `spot-panel`, `buy-sheet` and `meme-trade-sheet` need
  chain-aware display only (fee token, explorer links, wallet shown).
- Two new proxy schemas and one new hook (`use-solana-wallet-link`). No new
  environment variables: `WSAPI_BASE_URL` already resolves `gas-sponsor`.
- The sponsor wallet's SOL is now spent on memecoin trades as well as sends.
  Ops should watch its balance; the capabilities endpoint exposes the key.
- Solana balances update only after `CONFIRMED`, per the contract; the UI
  must not refetch on broadcast.

## Verification plan

- Unit: chain routing in `use-meme-trade` (8453 → EVM calls, 101 → Solana
  transaction); wallet-link signature is base58 and 64 bytes; proxy admits
  `solana/*` and rejects a malformed quote; `fetchToken` names the chain.
- Red-Green per Directive 3 for each.
- Preview deployment: one small Solana BUY and one SELL on mainnet, funded,
  watching `swaps/{id}/status` reach `CONFIRMED` and the treasury USDC ATA
  receive the fee. One Base BUY to prove no regression.
- Failure paths exercised in preview: expired quote, `TOKEN_RISK_BLOCKED`,
  insufficient balance, sponsor 502.
