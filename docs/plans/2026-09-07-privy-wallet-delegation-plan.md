# Implementation Plan: Privy Embedded Wallet Delegation

This plan implements automatic headless Privy wallet delegation on the frontend so the backend can manage on-chain transactions and signatures on behalf of each user.

## Proposed Changes

### 1. User Wallet Helpers (`lib/user.ts`)

- Add `isWalletDelegated(user: User, chainType: "ethereum" | "solana"): boolean`
- Update `EmbeddedWallet` interface to include `delegated: boolean` and `id?: string | null`
- Update `getEmbeddedWallets` to populate `delegated` and `id`

### 2. Auto-Delegation Hook (`hooks/use-ensure-wallets.ts`)

- Use `useHeadlessDelegatedActions()` from `@privy-io/react-auth`
- In `useEnsureWallets`, after provisioning/verifying wallets:
  - Check if Ethereum embedded wallet is delegated; if not, invoke `delegateWallet({ address, chainType: 'ethereum' })`
  - Check if Solana embedded wallet is delegated; if not, invoke `delegateWallet({ address, chainType: 'solana' })`
- Wrap in non-fatal try/catch so delegation errors never block authentication.

### 3. Session Route Update (`app/api/auth/me/route.ts`)

- Include `delegated` and `id` in the `wallets` array response for verified users.

### 4. Unit & Integration Tests

- `lib/user.test.ts`: test `isWalletDelegated` and `getEmbeddedWallets` delegation properties.
- `hooks/use-ensure-wallets.test.ts`: test that `useEnsureWallets` calls `delegateWallet` for undelegated wallets.
- `__tests__/auth-me-route.test.ts`: update mock and assertion to include `delegated: true`.

## Verification Plan

1. Execute Vitest test suite:
   ```bash
   pnpm vitest run lib/user.test.ts hooks/use-ensure-wallets.test.ts __tests__/auth-me-route.test.ts
   ```
2. Run full preflight verification:
   ```bash
   ./scripts/preflight.sh
   ```
