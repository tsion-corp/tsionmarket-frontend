---
title: CI in parallel
date: 2026-09-08
area: ci
scenario-impact: none
---

# Release Note: the quality gate runs in parallel

## What changed

The CI workflow ran its five gates in series on one runner, about six
minutes per run, with the tests taking half of it. It now runs four jobs on
separate runners: static checks (Prettier, ESLint, typecheck), two test
shards, and the build with the bundle budget and the release-notes gate. A
final `quality` job carries the name the branch protection requires and
passes only when every job did, so the rules are unchanged.

- ESLint and tsc keep their caches between runs (`.eslintcache`,
  `tsconfig.tsbuildinfo`), restored from the newest run on the same lockfile.
  Locally: ESLint 17 s cold to under 1 s warm, tsc 9 s to 3.5 s.
- Vitest runs as two projects: component tests (`.tsx`) in jsdom, everything
  else in Node. Booting jsdom cost 180 s of aggregate environment time
  against 22 s of tests; it is 51 s now. Eighteen `.ts` suites that use the
  DOM, storage or window declare `// @vitest-environment jsdom` per file.
- The same 2315 tests pass, split 134/133 files across the shards.

The measured wall time comes from the first run of this workflow on its own
PR.
