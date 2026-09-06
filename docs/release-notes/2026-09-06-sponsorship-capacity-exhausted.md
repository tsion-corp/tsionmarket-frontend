---
scenario-impact: updated
---

# Release Note: an exhausted sponsorship month is reported honestly

## Summary

When the Alchemy account that owns the Gas Manager policy has used its
monthly capacity, every sponsored transaction fails with a 429 whose body says
"Monthly capacity limit exceeded". The app passed that 429 through, the
browser's bundler client retried it four times, and the user was told "We're a
bit busy right now. Please try again in a moment", which could not be true
until the next billing cycle. Seen on 2026-09-06 on a Kash purchase.

The proxy now recognises that answer, logs it as the operations alarm it is,
and returns a JSON-RPC "resource unavailable" error (-32002) that the client
surfaces at once instead of retrying. The user reads "Gas-sponsored
transactions are paused until sponsorship capacity is restored. Your funds are
safe." A transient rate limit is unchanged: still a 429, still retried.

This does not restore sponsorship. That takes capacity on the Alchemy account
behind `ALCHEMY_API_KEY`, the one the policy is bound to; the fallback key is
a different account and is deliberately never used for sponsorship.

## What changed

- `lib/server/alchemy-bundler.ts`: detects the exhausted-capacity body,
  answers per call with `-32002` under the ids the client sent, logs.
- `lib/errors.ts`: maps that message to honest copy ahead of the rate-limit
  rule.

## Verification

- Red then green: proxy tests for the single call, the batch, and the
  ordinary 429 passthrough; a `friendlyError` test that the copy neither says
  "busy" nor "try again".
- `./scripts/preflight.sh` in full.
- Cause confirmed by probing the configured key directly: every method,
  including a plain block-number read, answers 429 "Monthly capacity limit
  exceeded"; the fallback key answers 200.

## Scenario impact

`updated`: the "sponsored transaction fails" scenario now has two outcomes,
a retryable throttle and a paused month, with different copy. Restoring
purchases is an account action, not a code change.
