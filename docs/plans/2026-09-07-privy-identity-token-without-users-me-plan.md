# Plan: attach Privy's identity token without asking Privy for it

Decision: `docs/adr/ADR-2026-09-07-privy-identity-token-without-users-me.md`.
Branch: `fix/privy-identity-token-storm`, off `origin/main`.

## Scope

`lib/privy-token.ts` (resolver), a new `lib/privy-identity-store.ts`, a new
`components/providers/identity-token-bridge.tsx` mounted in
`app/(session)/providers.tsx`, and tests. `lib/api.ts` and every caller are
untouched.

## Steps

1. **Research.** Confirm in the installed SDK that `getIdentityToken()` always
   GETs `/users/me` and that `useIdentityToken()` is a store read; confirm in
   Privy's docs when the SDK re-issues the token. Done; quoted in the ADR.
2. **Red.** Resolver: held token used without a call; near-expiry held token
   falls back once; thrown failure backs off 1s/2s/4s; rate limit waits 60s;
   valid token served while refresh fails. Bridge: mirrors, clears on null and
   on unmount. Run: four fail (the current resolver ignores held tokens and
   retries a thrown failure at once).
3. **Green.** Store, bridge, resolver with `peekIdentityToken` dependency and
   failure back-off; mount the bridge beside `SessionCacheGuard`.
4. **Audit.** Adversarial pass over cross-user leakage, stale-token states,
   stuck back-off, StrictMode double effects, remaining imperative callers.
   Fix every finding with a regression test.
5. **Release note.** `docs/release-notes/2026-09-07-privy-identity-token-without-users-me.md`,
   `scenario-impact: none`.
6. **Verify.** `./scripts/preflight.sh` in full. Dev server: deposit screen,
   five minutes, network filtered to `auth.privy.io`.
7. **Deliver.** PR against `main` with the governance template.

## Interface contracts

- `createTokenResolver({ getAccessToken, getIdentityToken, peekIdentityToken?, now? })`;
  `resolveAuthTokens()` signature and result shape unchanged.
- `setHeldIdentityToken(token | null)` / `peekHeldIdentityToken()`.

## Out of scope

Moving the identity token to an HttpOnly cookie on a base domain (Privy's
recommended path; separate ADR). Any change to server-side session
verification.
