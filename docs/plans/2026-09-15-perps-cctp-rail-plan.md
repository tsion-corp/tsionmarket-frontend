# Plan: perps on the current Ark contract (CCTP rail)

Implements `docs/adr/ADR-2026-09-15-perps-cctp-rail.md`. Branch
`feat/perps-cctp-rail`, cut from `origin/staging` at `b56f8959`; the PR targets
`staging`. Every step is test-first: the test is written, seen failing, then the
code makes it pass.

## Component boundaries (as built)

| Layer                        | File                                                                                                                    | Change                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/`                       | `lib/cctp/config.ts`, `cctp.ts`, `attestation.ts` (+ tests)                                                             | From `origin/feat/perps-on-mainline`. The attestation poller takes a lookup function, so the browser polls through its own transport.                                                                                                                                                                                |
| `lib/`                       | `lib/cctp/fees.ts` (+ test)                                                                                             | New. Validates Circle's fee quote and turns it into a base-unit `maxFee`, rounding up, exact on fractional basis points.                                                                                                                                                                                             |
| `lib/server/`                | `lib/server/cctp.ts`                                                                                                    | New. The Iris path allowlist, query rebuild and response validation.                                                                                                                                                                                                                                                 |
| `lib/server/`                | `lib/server/wsapi.ts`                                                                                                   | Perp allowlist adds `ark/deposit/cctp/(config\|record\|status/:txHash)` and drops `funding/deposit-address`, `funding/deposit-status`.                                                                                                                                                                               |
| `app/api/`                   | `app/api/cctp/[...path]/route.ts` (+ test)                                                                              | New proxy: GET only, signed-in sessions, the app's `{ success, data }` envelope.                                                                                                                                                                                                                                     |
| `app/api/`                   | `app/api/perp/[...path]/route.ts` (+ test)                                                                              | Address ownership regex loses the Dextopus deposit address.                                                                                                                                                                                                                                                          |
| `features/trade/lib/`        | `hyperliquid-types.ts`, `hyperliquid-api.ts`                                                                            | New `PreparedWithdrawal` shape and fee leg; CCTP deposit config, record and status; Dextopus funding calls removed.                                                                                                                                                                                                  |
| `features/trade/lib/`        | `cctp-api.ts` (+ test)                                                                                                  | New. Browser client for `/api/cctp`: fee quote, attestation lookup (404 reads as not indexed).                                                                                                                                                                                                                       |
| `features/trade/lib/`        | `cctp-transfers.ts` (+ test)                                                                                            | New. `burnBaseUsdcToPerps` and `sendArbitrumUsdcToBase` over injected wallet, fee and attestation dependencies; `CctpFeeUnavailableError` when a burn cannot be priced.                                                                                                                                              |
| `features/trade/lib/`        | `perps-withdrawal.ts` (+ test)                                                                                          | New. `planWithdrawal`: the typed total split into withdraw3 amount, combined fee and receive, with minimum and balance checks. Feature-local because only perps uses it.                                                                                                                                             |
| `features/trade/lib/`        | `perps-polling.ts` (+ test)                                                                                             | New. The two background poll gates.                                                                                                                                                                                                                                                                                  |
| `features/trade/lib/`        | `venue-scrub.ts` (+ test)                                                                                               | New. `scrubVenue`, and a test that no English catalogue string names the venue.                                                                                                                                                                                                                                      |
| `features/trade/lib/`        | `hyperliquid-actions.ts` (+ test)                                                                                       | `withdraw(total, onStatus)` subtracts the platform fee before prepare, re-prepares on a differing fee, signs and submits the fee leg, finishes over CCTP; `resumeWithdrawal` uses CCTP; new `depositToPerps(amount, onStage, timing)` resolving a `DepositOutcome`. Progress is reported as step codes, not English. |
| `features/trade/hooks/`      | `use-hyperliquid-positions.ts`, `use-hyperliquid-orders.ts`, `use-hyperliquid-trading.ts`, `use-hyperliquid-markets.ts` | Gated polls; `refetchOrders` and `refreshBalances` exposed; clearinghouse refetches on window focus.                                                                                                                                                                                                                 |
| `features/trade/hooks/`      | `use-cctp-deposit-fee.ts`                                                                                               | New. Fee mode and the live quote for the fund modal's fee line.                                                                                                                                                                                                                                                      |
| `hooks/`                     | `use-global-balance.ts` (+ test)                                                                                        | No interval; refetch on focus; `perpsBalanceQueryKey` for invalidation.                                                                                                                                                                                                                                              |
| `features/trade/components/` | `hyperliquid-fund-modal.tsx`, `hyperliquid-withdraw-modal.tsx` (+ new tests)                                            | Rebuilt on the new actions, exact base-unit checks, translated.                                                                                                                                                                                                                                                      |
| `features/trade/components/` | `hyperliquid-pro-perps.tsx` (+ test)                                                                                    | `onDeposit` wiring, string balance, narrow refetches, scrubbed order errors.                                                                                                                                                                                                                                         |
| `features/trade/components/` | `hyperliquid-close-position-modal.tsx`, `hyperliquid-orders-list.tsx`, `hyperliquid-trigger-modal.tsx`                  | Error messages scrubbed of the venue name.                                                                                                                                                                                                                                                                           |
| `lib/trade/`                 | `math.ts` (+ test)                                                                                                      | The Dextopus-era `estimatedWithdrawalFee` removed.                                                                                                                                                                                                                                                                   |
| `messages/*.json`            | five catalogues                                                                                                         | `perps.balanceMayBridge` de-branded; new `perpsFunds` namespace (38 strings) for both modals.                                                                                                                                                                                                                        |
| `docs/`                      | `API_CATALOG.md`, release note                                                                                          | Perp proxy base corrected; `/api/cctp` added.                                                                                                                                                                                                                                                                        |

## Interface contracts

```ts
// lib/cctp/fees.ts
export function maxFeeFromQuote(args: {
  amount: bigint;
  quote: CctpFeeQuote;
  finality: number;
  includeForwardFee: boolean;
}): bigint | null;

// features/trade/lib/perps-withdrawal.ts
export function planWithdrawal(args: {
  total: string;
  withdrawable: string;
  platformFee?: string;
}): WithdrawalPlan; // empty | exceedsBalance | belowMinimum | ok

// features/trade/lib/hyperliquid-actions.ts
withdraw(total: string, onStatus?: (step: WithdrawStep) => void): Promise<{ treasuryMovementId: string }>;
depositToPerps(amountUsdc: string, onStage?: (stage: DepositStage) => void): Promise<DepositOutcome>;
```

## State changes

- **Fund modal stages:** `form`, then `working` (`sending`, `recording`,
  `confirming`), then `outcome`: `credited`, `pending`, `recordFailed` or
  `failed`, the last two with the burn hash to copy. `onBridge` leaves the props;
  `onDeposit` replaces it.
- **Withdraw modal:** shows the plan for the contract's $0.50 platform fee. If
  the backend prepares a different fee, the action re-prepares before signing
  so the total that leaves is still the typed amount.
- **Query keys:** unchanged (`hl-positions`, `hl-orders`, `hl-clearinghouse`,
  `perps-balance`).

## Test strategy

1. `lib/cctp/*`: the encoders' calldata matches Circle's ABI; the attestation
   poller is ready, pending or times out; `maxFeeFromQuote` covers user-pays and
   platform-pays, rounding up and never down.
2. `withdrawal-amounts`: exact base-unit splits at the minimum, below it, at Max
   and with a null fee leg.
3. Proxies: allowlisted paths forward; traversal and unlisted paths 404; the
   Dextopus funding paths are now refused; Iris responses are validated.
4. Actions: withdraw signs both legs and sends `fee`; a null fee sends `null`;
   the CCTP leg batches approve and burn on Arbitrum, then mints on Base; it
   fails soft; resume is gated on `withdrawals/pending`.
5. Hooks: positions and orders poll only under their gates and stop when flat;
   the global balance has no interval and refetches on invalidation.
6. Modals: the quote failure refuses to burn; the fee line shows only when the
   user pays; a `record` failure after a burn shows the stranded state, not an
   error; withdraw blocks below the minimum and Max never exceeds
   `withdrawable`.
7. De-branding: `scrubVenue` removes all three names in any case; a test fails
   the build if an English catalogue value names the venue.

## UI

No layout change. The fund and withdraw modals keep their 2.0 frames; only
their copy and stages change. The ticket, positions list and desk are untouched
apart from which refetch they call.

## Rollout

`./scripts/preflight.sh`, then a PR to `staging`. Before merge, a real top-up of
a few dollars and a withdrawal back to Base on the staging deployment, with the
burn and mint transaction hashes recorded in the PR.
