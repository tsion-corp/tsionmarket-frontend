# Wallet upgrade: development and production

The wallet upgrade moves a person from their Decane wallet to our own wallet. It moves real money out of real wallets, so the two environments are kept apart and the safety rules **fail closed**: if the configuration is wrong, the upgrade switches itself off and says why.

The plan is `docs/CLERK_AND_WALLET_MIGRATION_PLAN.md` in the backend repo. This file is the operator's view of the environments.

## The split

|                          | Development                                 | Production                                                        |
| ------------------------ | ------------------------------------------- | ----------------------------------------------------------------- |
| Purpose                  | Build and rehearse                          | Real users                                                        |
| Clerk instance           | **Development** (`pk_test_…`)               | **Production** (`pk_live_…`, own domain)                          |
| Clerk users              | Throwaway test users                        | Real users                                                        |
| `NEXT_PUBLIC_DEPLOY_ENV` | `development`                               | `production`                                                      |
| Moves                    | **Always a dry run.** Nothing real is sent. | Real. A staged rollout can start as a dry run (`…_DRY_RUN=true`). |
| Wallet service           | Testnets / devnet                           | Mainnet, behind its own release gates                             |
| Decane                   | A development project (see "Open item")     | The production project                                            |
| Who can see `/upgrade`   | Anyone with the dev flag on                 | Behind the rollout cohort                                         |

Users in one Clerk instance do not exist in the other. Deleting a user in development cannot affect production.

## Guard rails (code: `features/wallet-upgrade/lib/environment.ts`)

| Situation                              | Result                                                 |
| -------------------------------------- | ------------------------------------------------------ |
| Flag not set                           | `/upgrade` is a 404                                    |
| Production build with `pk_test_` keys  | Upgrade off, page says why                             |
| Development build with `pk_live_` keys | Upgrade off, page says why (it would touch real users) |
| No Clerk keys                          | Upgrade off                                            |
| Development, any dry-run setting       | Always dry run                                         |
| Production, dry-run unset              | Real                                                   |
| Moving funds                           | Needs its own flag **and** the wallet-service flag     |

## Environment variables

| Variable                                  | Dev                                        | Prod                            | Meaning                                                           |
| ----------------------------------------- | ------------------------------------------ | ------------------------------- | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_DEPLOY_ENV`                  | `development`                              | `production`                    | Which environment this is. Falls back to the build mode if unset. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`       | `pk_test_…`                                | `pk_live_…`                     | Must match the environment                                        |
| `CLERK_SECRET_KEY`                        | dev secret                                 | prod secret                     | Server only                                                       |
| `NEXT_PUBLIC_WALLET_UPGRADE_ENABLED`      | `true`                                     | `true` when rolling out         | Master switch                                                     |
| `NEXT_PUBLIC_WALLET_UPGRADE_DRY_RUN`      | ignored                                    | `true` while rehearsing in prod | Nothing real moves                                                |
| `NEXT_PUBLIC_WALLET_UPGRADE_LINK_ENABLED` | `true` once the link service is deployed   | same                            | Enables the "connect the two" step                                |
| `NEXT_PUBLIC_CRYPTO_BACKEND_ENABLED`      | `true` once the wallet service is deployed | same                            | Enables wallet creation and recovery                              |
| `NEXT_PUBLIC_WALLET_UPGRADE_MOVE_FUNDS`   | `true` when built                          | same                            | Enables the move-funds step                                       |

`NEXT_PUBLIC_*` values are inlined at build time. Set them before building, and rebuild after changing them.

Server-side settings the link routes also read:

| Variable                             | Meaning                                                                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MIGRATION_SERVICE_ENABLED`          | `1` turns the migration proxies on (already used by the Privy → Decane flow)                                                                                                                         |
| `MIGRATION_API_URL`                  | The `user-management` service to call. **In development it must not be the production gateway**; the routes refuse (503 `NOT_AVAILABLE`) unless you also set the next variable.                      |
| `CRYPTO_WALLET_API_URL`              | The wallet service (`crypto-wallet`) the `/api/wallet-upgrade/wallet/*` routes call. Needs `NEXT_PUBLIC_CRYPTO_BACKEND_ENABLED=true` too. Subject to the same development-vs-production guard.       |
| `WALLET_UPGRADE_ALLOW_PROD_UPSTREAM` | `true` lets a development build call a production service. Almost never what you want: it writes development Clerk users into production data and could claim a real Decane account for a test user. |

Service-side (`user-management`): `AUTH_PROVIDERS` must include `clerk`, plus `CLERK_ISSUER_URL`, `CLERK_AUTHORIZED_PARTIES`, `CLERK_SECRET_KEY` and `CLERK_WEBHOOK_SECRET` (see the backend repo).

### Clerk instance settings (done once per instance)

- **Session token claim:** `session.claims = { "uid": "{{user.external_id}}" }`. Applied to the development instance with `clerk config patch`; the production instance needs the same patch (`--instance prod`) before launch.
- **Webhook:** point a Clerk webhook endpoint at the service's `/webhooks/clerk/events` and subscribe to `user.deleted`. It needs a public URL, so it is added where the service is deployed (not on localhost).
- Nothing is auto-provisioned on `user.created`, on purpose: a person migrating from Decane must arrive with no id so the link can give them their existing one.

## Setting each environment up

**Development**

1. Clerk development instance (already created by `clerk init`). Keys live in `.env.local`.
2. Set `NEXT_PUBLIC_DEPLOY_ENV=development` and `NEXT_PUBLIC_WALLET_UPGRADE_ENABLED=true`.
3. Run the app and open `/upgrade`. Sign in at `/sign-in`; Clerk returns you to `/upgrade`.

**Production**

1. Create the production instance: `npx -y clerk@latest deploy --mode agent --domain <your domain>`. This needs a domain you control with DNS access, not a hosting URL.
2. Follow the report's `nextAction` (DNS records, then OAuth credentials for Google and Apple).
3. Put the production keys on the host (not in the repo), and set `NEXT_PUBLIC_DEPLOY_ENV=production`.
4. Start with `NEXT_PUBLIC_WALLET_UPGRADE_DRY_RUN=true`, run the staff rehearsal, then remove it.

## Deleting users

Clerk users can be deleted from the Clerk Dashboard (Users), the Backend API (`DELETE /v1/users/{id}`), or the CLI. Deleting a Clerk user does **not** delete:

- data keyed on their user id in our services,
- an encrypted wallet package stored for them (once the wallet service exists).

Handle deletions through the `user.deleted` webhook so mappings and packages are cleaned up deliberately. Deleting a **production** user who has already linked a Decane account removes their way back into the new account; their funds are unaffected because the keys are encrypted for them, but they would need support to relink. Delete freely in development.

## What exists today, and what does not

| Step                                                                                                                                | State                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clerk sign-in, profile button, `/upgrade` page                                                                                      | Built                                                                                                                                                                                                                                                                                                                                           |
| Decane stays mounted for the legacy sign-in and signing                                                                             | Built (untouched)                                                                                                                                                                                                                                                                                                                               |
| Environment split and guard rails                                                                                                   | Built, tested                                                                                                                                                                                                                                                                                                                                   |
| Identity link, new-user provisioning and Clerk deletion webhook (`user-management`)                                                 | Built and tested in the monorepo (local branch `feat/clerk-verifier`, **not deployed**)                                                                                                                                                                                                                                                         |
| Frontend routes `/api/wallet-upgrade/{link,status,provision}` and the link step on `/upgrade`                                       | Built, tested; works once the service above is deployed and the flags below are on                                                                                                                                                                                                                                                              |
| Clerk `uid` session-token claim                                                                                                     | Set on the **development** instance; production needs the same (see below)                                                                                                                                                                                                                                                                      |
| Wallet service (`crypto-wallet`, monorepo branch `feat/clerk-verifier`, **not deployed**)                                           | Built and tested; stores encrypted packages, gates every change by device/recovery signature                                                                                                                                                                                                                                                    |
| Wallet UI: create (passphrase, a 32-byte recovery secret shown once and checked), unlock, recovery on a new browser with the secret | Built, tested; works once the service is deployed and the flags are on                                                                                                                                                                                                                                                                          |
| Move-funds flow (`NEXT_PUBLIC_WALLET_UPGRADE_MOVE_FUNDS`)                                                                           | Built and tested. **Only Ethereum, Arbitrum, Base and Solana can move**; every other chain is shown greyed out and is never planned or sent (`MOVABLE_NETWORKS` in `features/wallet-upgrade/lib/move-funds.ts`). Reuses the existing sweep with the Decane wallet as signer. Always a rehearsal in development. Not yet run against real funds. |

Steps that depend on an unbuilt service say so on the page and cannot be clicked.

## Open items

1. **Decane development project.** The local `.env.local` currently holds live Decane credentials. Even as a dry run, signing in to Decane in development reaches real Decane users. Use a Decane development project for development if one exists.
2. **Launch gate.** While the site is closed by `proxy.ts`, `/sign-in` and `/upgrade` are closed too. Add them to the open paths if staff need them before launch.
3. **Clerk app name.** The application is named "Tsion Ark" in Clerk; rename it if it should read TsionMarket.

## The signing layer (using the new wallet in the app)

Everything in the app that signs goes through one hook, `useWalletSigner`. With the switch off, which is the
default, it **is** the Decane wallet, handed through unchanged, and none of the new wallet's code is loaded.

| Variable                            | Meaning                                                                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_WALLET_SWITCH_ENABLED` | Builds the switch in. Off: the app is the Decane app whatever anyone chose. On: an account can choose the new wallet (Wallet card, "Use this wallet in the app"). The choice is per account, kept on the device. |
| `EVM_BROADCAST_RPC_<NETWORK>`       | Server-only. A broadcast endpoint for a network the new wallet may send on, e.g. `EVM_BROADCAST_RPC_BASE_MAINNET`. Unset means that network is off. It holds a provider key, so it never reaches the browser.    |
| `WALLET_INTERNAL_KEY`               | Server-only. The wallet service's internal key, so the relay can ask which addresses belong to the caller. Without it, sending is off (it fails closed).                                                         |

**What it does when on.** The app's addresses are the new wallet's, and its signatures (messages, typed data, 7702
delegations for gas-sponsored sends, user-paid transactions, Solana transactions) come from it. A locked wallet
signs nothing and a banner asks the person to unlock it. While the wallet loads, the app gets a signer that signs
nothing and shows no address: it never quietly falls back to Decane.

**Sending.** Gas-sponsored sends use the existing sponsor flow, so nothing is broadcast by us. A user-paid
transaction is signed in the browser and sent through `/api/evm-broadcast/<network>`. The read proxy has no write
method on purpose; the relay is the narrow alternative: Decane sessions only, one JSON-RPC method built server-side,
the transaction must be signed, standard (no blobs, no delegation transactions, no unprotected legacy), for exactly
that chain, and **from an address the caller's own wallet is registered with**; rate limited; and only on networks
an operator switched on.

**What does not move.** Balances the platform keeps in its own accounts (game credits, Kash, rewards) are keyed to
the old wallet's address and stay with it until a re-key carries them across. Switching is reversible from the same card.
