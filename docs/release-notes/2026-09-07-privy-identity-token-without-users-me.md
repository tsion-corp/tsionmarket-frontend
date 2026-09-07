---
scenario-impact: none
---

# Release Note: Privy `/users/me` no longer repeats under a rate limit

## Summary

On the deposit screen, `GET auth.privy.io/api/v1/users/me` repeated every
few seconds answering 429, and authed reads failed behind it. The request is
made inside the Privy SDK by `getIdentityToken()`, which always calls
`/users/me`; our resolver called it once an hour when healthy but, when the
call threw, retried on the very next request, and every poller and query
retry supplied one. The app now attaches the identity token the SDK already
holds, calls Privy only when nothing usable is held, and backs off on failure
(1s doubling to 60s; a full minute after a 429) while serving the last valid
token.

Decision record: `docs/adr/ADR-2026-09-07-privy-identity-token-without-users-me.md`
and its plain-English companion. Plan:
`docs/plans/2026-09-07-privy-identity-token-without-users-me-plan.md`.

## What changed

- `lib/privy-identity-store.ts` (new): module store for the SDK's current
  identity token.
- `components/providers/identity-token-bridge.tsx` (new): mirrors
  `useIdentityToken()` into that store; mounted in `app/(session)/providers.tsx`.
- `lib/privy-token.ts`: reads the held token first; exponential back-off on a
  failed refresh, 60s after a rate limit; serves an unexpired token during
  failure; logs each failed refresh and its wait. A token is attached only
  when it names the same user as the access token, and the back-off is
  forgotten when the session ends (both from the adversarial audit).

## Verification

- Red then green: six new resolver and bridge cases; existing cases unchanged.
- `./scripts/preflight.sh` in full.
- Manual: deposit screen with the network panel filtered to `auth.privy.io`
  shows no `/users/me` after load.

## Scenario impact

`none`: no visible change; the same screens stop provoking Privy's rate
limit and keep working while it is tripped.
