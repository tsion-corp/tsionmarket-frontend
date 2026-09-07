# ADR-2026-09-07: An ordered pool of Alchemy key and policy pairs

## Status

Accepted — 2026-09-07. Approved by the maintainer ("go, write the ADRs and
implement") after the findings below were presented.

## Context

Production's single Alchemy key hit its app's monthly capacity on
2026-09-07. Alchemy then refused every call on that key with `429 Monthly
capacity limit exceeded`: the Prices API, Base RPC reads that fall through
from ZeroDev, and the bundler and paymaster behind gasless Base trades. The
spot brief went blank; sponsored trades failed.

The code had a partial answer. `lib/server/alchemy-keys.ts` rotates reads and
prices between `ALCHEMY_API_KEY` and `ALCHEMY_API_KEY_FALLBACK`. That fallback
is a free-tier app whose price budget (300 lookups an hour) production spends
in minutes, so prices still failed. Sponsorship never rotated at all, and
correctly so: a Gas Manager policy belongs to the app that created it, and a
second key from a different app cannot sponsor under the first app's policy.

The team now holds three keys and three policies, index-aligned:

| index | key          | policy      | prices | Base RPC | paymaster with its policy | Polygon     |
| ----- | ------------ | ----------- | ------ | -------- | ------------------------- | ----------- |
| 0     | `ndj7…`      | `97312e13…` | ok     | ok       | "Must be authenticated"   | ok          |
| 1     | `alch_c2tg…` | `146f56e1…` | ok     | ok       | ok                        | ok          |
| 2     | `alch_Quvw…` | `1f9dd78d…` | ok     | ok       | ok                        | not enabled |

Measured against Alchemy directly on 2026-09-07. Index 0's app lacks the
paymaster methods this client has used since ADR-2026-09-06-base-sponsorship-
via-paymaster, so it can read and price but cannot sponsor on the current
path. Cross-pairs answer "Policy not found", confirming policies are bound
to their app.

## Decision

Treat the keys and policies as one ordered pool of pairs, and walk it in
index order for every Alchemy call, including sponsorship.

```
ALCHEMY_API_KEY=k0,k1,k2                    comma-separated, index-aligned
ALCHEMY_GAS_POLICY_ID=p0,p1,p2
ALCHEMY_POLYGON_GAS_POLICY_ID=q0,q1,q2      optional, same alignment, blanks allowed

lib/server/alchemy-keys.ts
  alchemyKeys()            the keys, in order (FALLBACK appended, deprecated)
  alchemyPairs()           [{ index, key, policyId?, polygonPolicyId? }]
  markAlchemyKeyBlocked()  a key that answered capacity/auth is skipped for a
                           cooldown, so later requests go straight to the next
  rotate()                 reads and prices: unblocked keys first, then the rest

lib/server/alchemy-bundler.ts
  sponsorship walks pairs that hold a policy for the network, sending each
  pair's own policy with its own key; capacity, auth and "Policy not found"
  move to the next pair; only when every pair is exhausted does the client
  get the "capacity exhausted" answer it already knows how to show
```

- **Pairing by index** is the invariant. A key is never sent with another
  index's policy. A key with no policy at its index reads and prices but
  never sponsors.
- **Cooldown, not memory.** A blocked key is remembered in-process for ten
  minutes on a monthly-capacity answer and one minute on a rate limit or an
  auth error, then tried again. Serverless instances each keep their own
  memory; that is acceptable, since the cost is one failed call per instance
  per cooldown.
- **Order is configuration.** The env lists decide the order. Given the
  table, the recommended order is `alch_c2tg…, alch_Quvw…, ndj7…` so the two
  paymaster-capable pairs lead and index 0 is the read-and-price reserve.
- **`ALCHEMY_API_KEY_FALLBACK` is deprecated**, still read and appended so a
  half-migrated environment keeps working, to be removed once every
  environment carries the list. `ALCHEMY_GAS_MANAGER_API_KEY` stays unread.

## Consequences

- Prices, reads and sponsorship all survive one app running dry, provided
  another pair has capacity. A block on every app still fails, honestly.
- The bundler proxy may make up to three upstream calls for one request when
  earlier pairs are blocked and the cooldown has not been recorded yet on
  that instance. After that, one.
- Polygon sponsorship needs its own policy per index; an index without one
  is skipped for Polygon.
- The `Monthly capacity limit exceeded` log line now fires only when every
  pair is exhausted, which is the operations alarm it was meant to be.

## Tests

Red first: list parsing and alignment, cooldown skipping in `rotate`, and
the bundler walking to the next pair with that pair's policy on capacity,
on auth, and on "Policy not found"; the exhausted answer only when all
pairs fail. Existing key-rotation and proxy tests keep passing.
