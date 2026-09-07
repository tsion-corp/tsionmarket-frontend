# Plan: Alchemy key pool (2026-09-07)

Companion to ADR-2026-09-07-alchemy-key-pool.

1. Red: `alchemy-keys.test.ts` — comma lists parse in order, pairs align by
   index with blanks allowed, `rotate` skips a blocked key and comes back
   after the cooldown. `alchemy-bundler.test.ts` — sponsorship moves to the
   next pair with that pair's policy on monthly capacity, on 401/403, and on
   "Policy not found"; a pair without a policy is never used for
   sponsorship; the exhausted answer only when every pair fails.
2. Green: `alchemyKeys()`, `alchemyPairs()`, block map with cooldown,
   `rotate` ordering; bundler walks `sponsorPairsFor(target)`.
3. `.env.example` documents the list shape and the recommended order.
4. Gates, release note, ship script. Env update commands for local, preview
   and production, keys and policies in the same order.
