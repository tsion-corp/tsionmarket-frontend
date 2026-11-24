---
date: 2026-11-24
branch: feat/paycrest-ramping
base: main
scenario-impact: needs_automation
---

# Paycrest for bank deposits and withdrawals

Both bank buttons in the funds modals now run on Paycrest's v2 API, which
moves money in both directions
([ADR](../adr/ADR-2026-11-24-paycrest-ramping.md)).

- **Withdraw to bank**
  1. Pick a Nigerian bank from Paycrest's list. The account is verified as
     soon as the ten-digit number is in.
  2. Enter a USDC amount. The live rate shows roughly how much naira will
     arrive.
  3. The app opens a Paycrest order and sends exactly the order's
     `amountToTransfer` USDC on Base to its receive address.
  4. The screen follows the order until it is paid, refunded or expired.
     If fees would take the transfer past the balance, nothing is sent.
- **Add from bank**
  1. Enter a naira amount, the user's own bank account (verified; refunds go
     there), a date of birth and a BVN or NIN.
  2. Paycrest requires these on every deposit. They are passed through to
     Paycrest and not stored.
  3. The order returns a bank account and the exact amount to pay. The
     screen waits until the USDC arrives in the wallet.

The new `/api/paycrest` proxy parses every Paycrest response with Zod. It
sets the session's own wallet as the refund address (withdrawals) or the
recipient (deposits), refuses a wallet sent from the browser, and only shows
an order to the wallet it belongs to. Amounts are checked in `bigint` base
units.

`BANK_RAIL` in `features/funds/lib/flags.ts` switches back to the previous
Difference-rail screens without a revert. The old rail's code stays until
Paycrest has carried real traffic.

## Configuration

`PAYCREST_API_KEY` (server-only) must be set in each deployment's
environment. The Sender Dashboard must have the token configured on Base
(USDC is). Without the key, the order routes answer 503 `NOT_CONFIGURED`.

## Verified

- Unit and wiring tests for the client, the proxy route and both screens.
  The screens go through real hooks with only HTTP faked.
- Live public reads (currencies, institutions, rates) and an authenticated
  order list against `api.paycrest.io`.
- Not yet verified: a real order. The create and status responses are typed
  from Paycrest's OpenAPI docs. The first small real withdrawal is the
  end-to-end check, and scenario automation for both flows is still to do.
