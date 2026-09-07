---
title: Alchemy key pool
date: 2026-09-07
area: infrastructure
adr: ADR-2026-09-07-alchemy-key-pool
scenario-impact: needs_automation
---

# Release Note: Alchemy keys and gas policies as an ordered pool

## What changed

`ALCHEMY_API_KEY` and `ALCHEMY_GAS_POLICY_ID` (and the Polygon policy
variable) are comma-separated, index-aligned lists. Every Alchemy call walks
the keys in order: prices and reads through `lib/server/alchemy-keys.ts`,
sponsorship through the bundler proxy, which sends each key with the policy
at its own index and never mixes them. A key that answers monthly capacity,
a rate limit, an auth error or "Policy not found" is skipped for a cooldown
(ten minutes for capacity, one minute otherwise) so later requests start
past it. The "capacity exhausted" answer the client already handles is now
sent only when every pair is exhausted.

`ALCHEMY_API_KEY_FALLBACK` is deprecated: still read and appended to the
list, never used for sponsorship. `ALCHEMY_GAS_MANAGER_API_KEY` stays unread.

## Verified

- Unit: list parsing and alignment with blank slots, cooldown skipping and
  expiry, the bundler walking to the next pair with that pair's policy on
  capacity, auth and "Policy not found", the exhausted answer only when all
  pairs fail.
- Live: with the capacity-blocked production key placed first in the list,
  `/api/prices` answered 200 through the second key.
- Live pairing check against Alchemy on 2026-09-07: `alch_c2tg…` +
  `146f56e1…` sponsors on Base and Polygon; `alch_Quvw…` + `1f9dd78d…`
  sponsors on Base (Polygon not enabled on that app); `ndj7…` reads and
  prices but its app lacks the paymaster methods.

`scenario-impact: needs_automation` — a sponsored trade through the second
pair needs a signed-in session and a blocked first pair to observe.

## Environment

Set in local, preview and production, same order everywhere:

```
ALCHEMY_API_KEY=alch_c2tgqfWwAzWoq5SLynVVR,alch_Quvw-p7pWrKf4cGfcHsmD,ndj7NaoUntxuE2Kss-st_
ALCHEMY_GAS_POLICY_ID=146f56e1-2959-45c6-a12b-60a35308671c,1f9dd78d-25d0-4f37-8aa0-c65034a7a71c,97312e13-5adb-44d9-ab90-c9327c715eae
ALCHEMY_POLYGON_GAS_POLICY_ID=146f56e1-2959-45c6-a12b-60a35308671c,,
ALCHEMY_API_KEY_FALLBACK=            (remove)
ALCHEMY_GAS_MANAGER_API_KEY=         (remove)
```

`sync-alchemy-env.sh` at the repo root applies exactly this.
