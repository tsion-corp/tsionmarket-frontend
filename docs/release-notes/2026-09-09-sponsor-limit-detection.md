---
title: Spend-limit and policy-type answers move the sponsorship pool on
date: 2026-09-09
area: trade
scenario-impact: none
---

# Release Note: two more Alchemy answers the key pool understands

## What changed

On 2026-09-09 the index-0 Gas Manager policy reached its sponsorship spend
limit. Alchemy answered every sponsored send with a 200 carrying a JSON-RPC
error, "This transaction's USD cost will put your team over your gas
sponsorship Limit". The pool only knew the 429 "Monthly capacity limit
exceeded" wording, so it passed the raw error to the user instead of trying
the next pair and, when none could serve, showing the paused message.

Two answers now count as a pair that cannot serve:

- "over your gas sponsorship limit" (200 or 429) is exhausted capacity: the
  pair is rested for the monthly cooldown and the next pair is tried.
- "Unsupported Policy Type" and "Policy ID(s) not found" are rejections,
  like a missing policy: the pair is skipped.

When no pair served and at least one was out of capacity, the client gets
the paused-sponsorship error it will not retry, since a misconfigured pair
could never have served anyway.

## Files

- `lib/server/alchemy-bundler.ts`, `lib/server/alchemy-bundler.test.ts`.

## Verification

- Proxy tests: the spend-limit answer walks to the next pair and ends in
  the paused message; an unsupported policy type is skipped and the next
  pair's answer returned.
- Live probe of all four pairs with `alchemy_requestGasAndPaymasterAndData`
  on 2026-09-09, which is also what produced the new pool order in
  `sync-alchemy-env.sh`.
