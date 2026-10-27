---
date: 2026-10-23
feature: migrate-env.sh treats Vercel's [SENSITIVE] placeholder as missing
scope: fix
scenario-impact: none
---

# migrate-env.sh: Sensitive values are no longer uploaded as placeholders

`scripts/cloudflare/migrate-env.sh` stops before uploading when a variable has
no value, because Vercel does not return Sensitive values. It only checked for
empty strings. Vercel CLI 60 writes Sensitive values as the text
`[SENSITIVE]` instead, so the first staging run uploaded that text as the value
of 28 Worker secrets.

## What changed

- A value of `[SENSITIVE]` now counts as missing: nothing is uploaded, and the
  script writes `~/tsionmarket-<env>.env` for the values to be filled in.
- The skipped and missing name lists end with a newline, so the next message no
  longer runs onto the last name.
- `scripts/cloudflare/migrate-env.test.ts` runs the script with `pnpm` stubbed
  and covers both cases: placeholder present (stops, no upload) and every
  value filled (uploads to the staging Worker).

## Recovery

Re-running the fixed script with the filled file overwrites the 28 secrets on
`tsionmarket-staging`. A secret left out of the file keeps its placeholder
value and must be deleted in the dashboard.
