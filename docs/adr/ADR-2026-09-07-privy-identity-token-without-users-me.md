# ADR-2026-09-07: Attach Privy's identity token without asking Privy for it

## Status

Accepted — 2026-09-07. The maintainer delegated the decision and the fix
("i want you to decide since you have more experience, try to do it") after
the team proposed caching the endpoint with TanStack Query; this record
explains why that proposal cannot work and what does.

## Context

On production, the deposit screen's network panel showed
`GET https://auth.privy.io/api/v1/users/me` repeating every few seconds and
answering **429 Too Many Requests**, with other requests failing behind it.
The team's proposal was "cache it with TanStack Query".

That request is not ours to cache. It is made inside the Privy SDK
(`@privy-io/react-auth` 3.35.1) by `getIdentityToken()`, whose implementation
is, verbatim from the installed bundle:

```
async function ki(){ return await(gi?.updateUserAndIdToken()), … }
async updateUserAndIdToken(){ let e = await this.api.get("/api/v1/users/me"); … }
```

Every call is a network round trip, whatever the SDK already holds. We call
it from one place, `lib/privy-token.ts`, which since PR #56 caches the result
per access token and collapses concurrent callers, so a healthy session makes
one call per hour.

The loop is what happens when that one call fails. The resolver's failure
handling covered only the "returned null" case (a one-second back-off from
PR #228). A thrown error, which is what a 429 produces, left nothing behind:
the in-flight slot was cleared and the next caller, which on the deposit
screen is the portfolio poll, the balance reconciler, the deposit-address
query and every TanStack retry of each, called `getIdentityToken()` again at
once. Each call was another `/users/me`, each answered 429, and the limit
never got a chance to clear. Nothing in TanStack's retry policy can stop
this: the queries were already refusing to retry a 429; the calls came from
inside token resolution, before any query could see a status.

Two facts from Privy's own documentation and the installed SDK shape the
fix:

- "A new identity token is automatically issued when a user: authenticates
  into the application, links or unlinks an account, refreshes their
  application page, calls `getAccessToken` when the access token is
  expired." The SDK stores it (`storeIdentityToken` writes its store, local
  storage and a cookie) in both cookie and non-cookie modes.
- `useIdentityToken()` returns that stored value. It is a store read; it
  makes no request.

So in a healthy session the token we need is always already in the browser,
kept fresh by the SDK's own access-token refresh, and asking `/users/me` for
it is redundant.

## Decision

1. **Read what the SDK holds first.** `IdentityTokenBridge`, a render-nothing
   client component inside `PrivyProvider`, mirrors `useIdentityToken()` into
   a module store (`lib/privy-identity-store.ts`). The resolver reads that
   store before anything else and, when the held token has more than the
   60-second refresh skew left, attaches it with no network call.
2. **Call Privy only when nothing usable is held**, that is the startup
   window before the SDK has issued a token, or a token within a minute of
   expiry that the SDK has not yet replaced.
3. **Back off on failure.** A failed refresh, thrown or null, waits 1s, 2s,
   4s… up to 60s before the next attempt; a rate limit (429, "too many
   requests", "rate limit") waits the full 60s. Concurrent callers share one
   attempt as before. The failure is logged with its wait, not hidden.
4. **Serve the still-valid token meanwhile.** While a refresh is failing, an
   unexpired token from the SDK or from the last successful refresh is
   attached rather than nothing, because a valid token is better than a 401
   and far better than another `/users/me`.

Two conditions from the adversarial audit are part of the decision. A held
or cached token is attached only when its `sub` (the user's DID) matches the
access token's, so a token the SDK still holds for the previous user can never
go out with the next user's session; and the back-off is reset when the
session ends, so a new sign-in does not wait out the old session's failures.

`lib/api.ts` is unchanged: a null identity token still becomes the
"Auth not ready, retrying" error under `requireAuth`, and that retry now
returns from memory during a back-off instead of reaching Privy.

### Alternatives considered

- **Cache `/users/me` with TanStack Query.** Impossible as stated: the
  request is not made by our code. Wrapping `getIdentityToken()` in a query
  would only add a second cache in front of the one that already exists and
  would not stop the failure loop.
- **Identity token as an HttpOnly cookie on a base domain** (Privy's
  recommended path). Removes the header, and the resolver, entirely for
  same-origin routes. It is a deployment change (Privy dashboard base domain,
  server routes reading the cookie) with its own ADR; this decision does not
  block it and reduces the urgency.
- **Stop sending the identity token at all.** Server routes accept a missing
  one but then call Privy's server API to resolve the user per request, which
  moves the load rather than removing it.
- **Longer TanStack retry delays.** Treats the symptom in one caller; the
  loop is fed by every caller.

## Consequences

- Healthy sessions make **zero** `/users/me` calls from the app after
  startup; before, one per hour plus one per access-token rotation.
- A Privy outage or rate limit produces at most one `/users/me` per back-off
  window per tab, and authed requests keep flowing on the last valid token.
- A `console.warn` names each failed refresh and its wait, so a future
  incident is diagnosable from the console.
- Tests that encoded the old behaviour still pass unchanged; eight new cases
  cover the held token, near-expiry fallback, exponential back-off, the
  rate-limit minute, serving a valid token during failure, the same-user
  check, the back-off reset on sign-out, and the bridge.
- Scenario impact: `none` visible; the deposit screen and every authed read
  behave as before, without the storm.

## Verification plan

1. Red: the six new tests fail against the current resolver (four did; two
   pass trivially and stay as regression guards).
2. Green: the store, bridge and resolver.
3. `./scripts/preflight.sh` in full.
4. Local dev server, signed in, deposit screen open for five minutes with
   the network panel filtered to `auth.privy.io`: no `/users/me` after the
   initial load. Production: the same check after deploy.
