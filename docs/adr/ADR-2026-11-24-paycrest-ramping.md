# ADR: Paycrest as the bank rail, both directions, with inline customer KYC

- **Status:** Accepted 2026-11-24 by the maintainer, after a first draft that
  wrongly treated Paycrest as offramp-only. The maintainer confirmed Paycrest
  works stablecoin → fiat and fiat → stablecoin, and that USDC on Base (and
  other tokens) is now configured in the Sender Dashboard.
- **Deciders:** the maintainer
- **Base branch:** `main`. Paycrest is a third-party API with a live
  production key. Nothing on the WSAPI gateway is needed, so nothing waits on
  `dev` or `staging` services.
- **Plan:** [2026-11-24-paycrest-ramping-plan](../plans/2026-11-24-paycrest-ramping-plan.md)
- **Out of scope:** `features/remit/*`, deleting the Difference and Pouch rail
  code, a webhook receiver, non-NGN corridors in the UI, Base gas sponsorship

## Context

Today the bank screens in the funds modals run on the gateway's `ramping`
service (the Difference rail):

```
bank-withdraw-screen.tsx ─┐
bank-transfer-screen.tsx ─┴─► hooks/use-ramping.ts ─► /api/ramping/[...path] ─► wsapiService("ramping")
```

A second, older Pouch rail (`lib/pouch/*`, `app/api/pouch/*`,
`features/funds/hooks/use-pouch-*`, `features/funds/components/kyc/*`) is
still in the tree and mostly orphaned.

The product owner wants Paycrest to be the single bank rail.

### Paycrest v2, verified live on 2026-11-24

One create call, `POST /v2/sender/orders`, serves both directions. The
direction comes from `source.type` and `destination.type`.

| Call                                           | Auth      | Verified live                                                     |
| ---------------------------------------------- | --------- | ----------------------------------------------------------------- |
| `GET /v2/currencies`                           | none      | yes                                                               |
| `GET /v2/institutions/{currency}`              | none      | yes: `[{name, code, type}]`                                       |
| `GET /v2/rates/{network}/{token}/{amt}/{fiat}` | none      | yes: `{buy, sell}`, each `{rate, providerIds, orderType, ...}`    |
| `POST /v2/verify-account`                      | `API-Key` | yes: `data` is the holder's name, or `"OK"` when no name is given |
| `GET /v2/sender/orders`                        | `API-Key` | yes: the key authenticates, and no orders exist yet               |
| `POST /v2/sender/orders`                       | `API-Key` | shape from the v2 OpenAPI docs; no real order created yet         |
| `GET /v2/sender/orders/{id}`                   | `API-Key` | shape from the v2 OpenAPI docs                                    |

All amounts and rates on v2 are **decimal strings**, both in requests and in
responses.

- **Offramp** (`source.type: "crypto"`): the response's `providerAccount`
  gives a `receiveAddress`, an `amountToTransfer` and a `validUntil`. The app
  sends exactly `amountToTransfer` to that address before `validUntil`.
- **Onramp** (`source.type: "fiat"`): `providerAccount` is a virtual bank
  account. The user transfers exactly `amountToTransfer` NGN to it.
  `source.kyc` is **required**: full name, birth date (18 or over) and an ID
  document. For NGN the ID is a BVN or NIN (11 digits, issuer `NG`).
  `source.refundAccount` must be in the customer's own name, and the deposit
  must come from the customer's own account, or Paycrest refunds it.

### Where the original plan was wrong or is out of date

1. It used the v1 API (`/v1/sender/orders` with a flat `recipient`), which
   is offramp-only. v2 is the current API and covers both directions.
2. It said the live rail was "Pouch/Yellowcard (`lib/ramping/*`)".
   `lib/ramping` is the Difference rail, reached through the gateway.
3. It treated KYC as a separate Pouch flow to rewire. On Paycrest, customer
   KYC is **inline on the onramp order**, so it is part of the deposit form.
   The Pouch KYC session flow (`use-pouch-kyc`, `KycOnboarding`) is not
   needed. `DateField` is reused for the birth date.
4. It gated `GET orders/:id` on a session only. Paycrest has no notion of our
   users, so the proxy also checks that the order belongs to the caller's
   wallet. For an offramp that is `source.refundAddress`; for an onramp,
   `destination.recipient.address`.
5. Money: the repo forbids floats. Amounts are validated as decimal strings
   and converted to `bigint` base units for every check and calculation. They
   go to Paycrest as the strings v2 asks for.
6. AGENTS.md rule 7 (`wsapiService`) covers our gateway only. Paycrest is a
   third party, as Pimlico and Alchemy are, so its base URL is a constant in
   `lib/server/paycrest.ts`. The only new env var is the key.

## Decision

```
features/funds/components/paycrest-withdraw-screen.tsx   (offramp UI)
features/funds/components/paycrest-deposit-screen.tsx    (onramp UI + KYC)
        │
        ▼
hooks/use-paycrest.ts            react-query hooks, envelope unwrap
lib/paycrest/types.ts            domain types (shared client/server)
lib/paycrest/amounts.ts          bigint decimal helpers
        │  /api/paycrest/<path>
        ▼
app/api/paycrest/[...path]/route.ts    allow-list, session gate, Zod bodies,
        │                              server-stamped wallet, ownership check
        ▼
lib/server/paycrest.ts (server-only)   v2 client, Zod response parsing,
        │                              API-Key header, typed errors
        ▼
https://api.paycrest.io/v2
```

### Proxy surface

| Route                            | Gate                                                 | Cache |
| -------------------------------- | ---------------------------------------------------- | ----- |
| `GET currencies`                 | public                                               | 600 s |
| `GET institutions/:currency`     | public, `^[A-Z]{3}$`                                 | 600 s |
| `GET rates/:token/:amount/:fiat` | public, token allow-listed, amount decimal           | none  |
| `POST verify-account`            | session                                              | never |
| `POST orders/offramp`            | session; `source.refundAddress` = session EVM wallet | never |
| `POST orders/onramp`             | session; recipient address = session EVM wallet; KYC | never |
| `GET orders/:id`                 | session; order must belong to the session wallet     | never |

- The network is fixed to `base`. Tokens are allow-listed to `USDC` and
  `USDT`.
- The browser never sends a wallet address. The server always sets it.
- KYC fields pass through the proxy to Paycrest and are never logged,
  cached or stored by us.
- Every upstream response is parsed with Zod into `lib/paycrest/types.ts`
  shapes. A response missing a field we act on (`id`, `status`,
  `providerAccount.receiveAddress` / `accountIdentifier`, `amountToTransfer`,
  `validUntil`) fails as a 502 rather than reaching a screen.
- A missing `PAYCREST_API_KEY` gives a 503 `NOT_CONFIGURED`, never a
  fallback.

### UI

- **Withdraw to bank** (`WithdrawModal` → bank):
  1. Pick a bank from Paycrest's NGN institutions; the account is verified at
     10 digits.
  2. Enter a USDC amount. The live sell quote shows the naira estimate.
  3. Create the order, then send exactly `amountToTransfer` USDC on Base to
     `receiveAddress`.
  4. Poll until `validated` or `settled` (paid), or `refunded` or `expired`.
- **Deposit from bank** (`FundsModal` → bank):
  1. Enter the naira amount.
  2. Enter the refund bank account, verified; its holder name is the KYC full
     name.
  3. Enter date of birth and BVN or NIN.
  4. Create the order and show the virtual account, the exact amount and the
     deadline.
  5. Poll until `settled`.
- The rail switch is one constant, `BANK_RAIL` in
  `features/funds/lib/flags.ts`, set to `"paycrest"`. Setting it back to
  `"ramping"` restores today's screens without a revert.
- Every fetch has a loading and an error state. All strings go into
  `en/de/es/fr/pt`.

## Consequences

- **Positive:** one rail for both directions. KYC is collected exactly where
  Paycrest needs it, and no KYC data is stored on our side.
- **Negative:** the create and status responses are typed from Paycrest's
  OpenAPI docs and have not been seen live yet. The first real order (a small
  withdrawal to the maintainer's own account) is the confirming test. Zod
  makes any mismatch fail loudly.
- **Negative:** onramp users re-enter their BVN on each deposit, because we
  don't store it. A KYC profile held on a server is a later decision.
- **Neutral:** the Difference and Pouch code stays until Paycrest has carried
  real traffic. Then a cleanup PR removes it.

## Alternatives considered

- **Keep the plan's foundation-only scope.** Rejected: the dashboard blocker
  is cleared and the maintainer asked for the working flow.
- **Reuse the Pouch KYC session flow.** Rejected: Paycrest takes KYC inline
  per order, and Pouch is a different provider.
- **Trust a wallet address from the browser.** Rejected: one user could make
  another user's wallet the refund target or the recipient.
- **Run Paycrest through a gateway service.** Cleaner key custody, but no
  such service exists; building one is backend work outside this repo.
