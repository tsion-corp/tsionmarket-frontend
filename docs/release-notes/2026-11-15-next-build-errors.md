---
date: 2026-11-15
branch: fix/next-build-errors
base: main
scenario-impact: none
---

# App Router build fixes

The chess lobby URL helpers now live in a casino utility module, and both pages
and their tests use that module. The vault status decoder is private to its route.
The URL and API response behavior is unchanged.

The chess lobby and vault route tests cover the affected behavior. TypeScript and
an isolated Webpack production build pass. Vitest uses four workers to reduce
resource contention across the full test suite.
