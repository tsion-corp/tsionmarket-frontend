# ADR-2026-09-07: Privy Embedded Wallet Delegation for Server-Side Transaction Execution

## Status

Proposed — 2026-09-07. Awaiting human maintainer review and approval.

---

## Context

World Street Web Services utilizes Privy embedded wallets (both Ethereum and Solana) created headlessly upon user authentication (`hooks/use-ensure-wallets.ts`). The production application currently serves over 20,000 active users.

1. **Safety & Zero Data Loss Guarantee**:
   - Delegation in Privy **does NOT replace, recreate, migrate, or alter** existing user wallets or cryptographic keypairs.
   - The user's public wallet addresses (`ethereum` and `solana`) remain identical.
   - All token balances, LP positions, NFTs, and transaction histories are 100% untouched and preserved on-chain.
   - Delegation simply provisions an authorization signer in Privy's infrastructure allowing the registered backend to execute transactions on behalf of the user's existing embedded wallet.

2. **Existing Implementation Gap**:
   - Currently, `hooks/use-ensure-wallets.ts` only provisions wallets if they are missing (`!hasEmbeddedWallet`).
   - It does not request or check delegation.
   - Backend services cannot sign or execute transactions on behalf of users without delegated permissions.
   - The session endpoint (`/api/auth/me`) and helper functions in `lib/user.ts` do not expose delegation status.

3. **Privy SDK Capabilities**:
   - Client SDK `@privy-io/react-auth` provides `useHeadlessDelegatedActions()` with method `delegateWallet({ address, chainType })`.
   - `account.delegated` (boolean) on the linked wallet account indicates whether delegation is active.
   - If a wallet is already delegated (`account.delegated === true`), re-delegation is skipped immediately.

---

## Decision

We will implement automatic headless Privy wallet delegation during authentication without disrupting existing user sessions or risking wallet data:

### 1. Zero-Data-Loss Safe Execution in `useEnsureWallets`

In `hooks/use-ensure-wallets.ts`:

- Continue existing checks: if a wallet is missing, provision it via `createWallet()`. Existing wallets are never touched or recreated.
- Retrieve the current user's Ethereum and Solana wallet addresses.
- Check `isWalletDelegated(user, chainType)`:
  - If `delegated === true`, skip delegation (no-op).
  - If `delegated === false`, invoke `delegateWallet({ address, chainType })`.
- Wrap delegation in individual non-blocking `try/catch` blocks:
  - If delegation fails (e.g. temporary network timeout or dashboard signer toggle pending), the error is caught and logged.
  - The user's authentication and navigation to `/interests` or `/dashboard` are NEVER blocked.

### 2. State and Model Enhancements in `lib/user.ts`

- Add `isWalletDelegated(user: User, chainType: "ethereum" | "solana"): boolean` to check `account.delegated === true`.
- Update `EmbeddedWallet` interface to include `delegated: boolean` and `id?: string | null`.
- Update `getEmbeddedWallets` to parse `delegated` and `id` properties.

### 3. Expose Delegation Status in `/api/auth/me`

In `app/api/auth/me/route.ts`:

- Include `delegated` and `id` in the `wallets` array returned for verified users.

---

## Production Impact Analysis (20k Live Users)

| Metric                       | Impact         | Safeguard                                                                                      |
| :--------------------------- | :------------- | :--------------------------------------------------------------------------------------------- |
| **Wallet Addresses**         | Unchanged      | Same embedded wallet address on EVM and Solana                                                 |
| **Balances & Assets**        | 100% Preserved | Keys and on-chain balances are never migrated or wiped                                         |
| **Existing Logged-In Users** | Seamless       | On their next login/session check, undelegated wallets will quietly delegate in the background |
| **Network Failures**         | Non-blocking   | Login and routing to `/dashboard` proceed even if delegation RPC fails                         |
| **Revocation**               | User Custody   | Users retain the ability to revoke delegation at any time                                      |
