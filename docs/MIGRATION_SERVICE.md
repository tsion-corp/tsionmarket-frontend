# Migration service contract

The frontend moves a user's money out of their old Privy wallets into their
new Decane wallets. Most of that money is on-chain and the browser handles it
alone. What the browser cannot do is re-key the ledgers the platform services
keep per wallet address (Kash points and tier, the chess cashier, lottery
tickets, Swiss seats, earn payout addresses), or know, on a brand-new device,
which old wallet belongs to a Decane account. This service does both.

The frontend ships ahead of it. With `MIGRATION_SERVICE_ENABLED` unset, the
proxies answer as if no account were linked and the flow works from the
on-chain venues alone.

## Location

Gateway service `user-management`, so `WSAPI_BASE_URL/v1/user-management` (the migration contract is mounted at that service's root). The frontend
proxies it at `/api/migration/*` and never calls it from the browser.

Frontend environment:

| Variable                    | Meaning                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| `MIGRATION_SERVICE_ENABLED` | `1` turns the proxies on. Anything else answers the empty status. |
| `MIGRATION_API_URL`         | Local override of the service base. Unset in deployments.         |

## Authentication

Every call carries the current Decane access token:

```
Authorization: Bearer <decane access token>
```

The link call also carries the OLD identity:

```
x-legacy-authorization: Bearer <privy access token>
privy-id-token: <privy identity token>
```

The frontend proxy verifies both tokens before forwarding (Decane through
`decane-node`, Privy through `@privy-io/node`). The service must verify them
again and resolve the wallets itself; the proxy sends no addresses.

Resolving the sides:

- Decane: `verifyAccessToken` for the user id, `getAddresses` for
  `{ evm, solana }`.
- Privy: verify the access token for the user id; read the user (identity
  token or user id) and take the **embedded** wallets only
  (`wallet_client_type == "privy"`), one `ethereum` and one `solana`. Linked
  external wallets are never the legacy identity.

## Envelope

Every response is the gateway envelope:

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "UPPER_SNAKE", "message": "..." } }
```

## `POST /v1/user-management/link`

Links the Decane account to the Privy account and re-keys the ledgers.
Idempotent: a repeated call for the same pair returns the stored link and
re-runs any re-key still `pending` or `failed`.

Request body: `{}`.

Response `data`:

```json
{
  "linked": true,
  "legacy": { "evm": "0x…", "solana": "…" },
  "current": { "evm": "0x…", "solana": "…" },
  "rekey": {
    "kash": "done",
    "cashier": "done",
    "lottery": "none",
    "swiss": "pending",
    "earn": "failed"
  },
  "linkedAt": "2026-08-25T10:00:00Z"
}
```

`rekey` values: `done`, `pending` (accepted, still running), `failed`
(will be retried on the next link call), `none` (nothing to move for that
ledger). Ledgers and what "re-key" means for each:

| Ledger    | Moves from old to new address                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `kash`    | Points, lifetime totals, subscription tier, username, referral tree. Unclaimed weekly points settle to the new wallet.     |
| `cashier` | Available balance, every locked bucket, pending withdrawals. A match in play settles to the new key when it ends.          |
| `lottery` | Active tickets and any unpaid winnings.                                                                                    |
| `swiss`   | Tournament seats and organizer authority.                                                                                  |
| `earn`    | Payout address on the talent profile. Accept Decane tokens for linked users so the earn API works without a Privy session. |

Errors:

| Status | Code                    | When                                                       |
| ------ | ----------------------- | ---------------------------------------------------------- |
| 401    | `UNAUTHORIZED`          | Either token fails to verify.                              |
| 409    | `LEGACY_ALREADY_LINKED` | The Privy account is linked to a different Decane account. |
| 409    | `SAME_WALLET`           | Both tokens resolve to the same EVM wallet.                |

## `GET /v1/user-management/status`

What the service knows about the caller's old wallet. Cheap; the frontend
polls it at most every five minutes per session and on demand after a run.

Response `data`:

```json
{
  "linked": true,
  "legacy": { "evm": "0x…", "solana": "…" },
  "hasLegacyFunds": true,
  "legacyFundsUsd": 42.17,
  "pendingOnramps": ["ord_123"],
  "rekey": { "kash": "done", "cashier": "pending" }
}
```

- `legacy` is `null` and `linked` is `false` for an account that never
  linked. The proxy also maps an upstream 404 to this shape.
- `hasLegacyFunds` means the service can see money still keyed to the old
  wallet: on-chain balances at the legacy addresses (a portfolio read), or a
  ledger row whose re-key is not `done`. `legacyFundsUsd` is the display
  total; the frontend never moves money on this figure.
- `pendingOnramps` lists bank or card deposit order ids whose destination is
  still the old wallet. The frontend keeps offering the migration until this
  is empty, because those deposits land days later.

## What the frontend does with it

- Account modal: an always-visible "Move money from my old wallet" row with a
  badge showing `legacyFundsUsd` when `hasLegacyFunds`.
- Balance card: the one-click Update Balance button appears when the device
  has Privy history **or** `hasLegacyFunds` **or** `pendingOnramps` is not
  empty, until a run completes with nothing left.
- The sheet posts `link` right after the first Privy sign-in and on every
  later opening, then reads `status` again.
- Before sign-in on a fresh device, `status.legacy` lets the sheet discover
  the on-chain venues and tell the user roughly how much is waiting.
