---
scenario-impact: updated
---

# Release Note: Market Square is on

## Summary

Market Square, the platform's social and discovery surface, is shown wherever
its deployment URL is configured. Every integration already existed and was
behind one hard-coded off; that constant is now a launch switch that is on by
default and closed only by an explicit `NEXT_PUBLIC_MARKET_SQUARE_LIVE=false`,
the same shape as the app's takedown switch.

Decision record: `docs/adr/ADR-2026-09-06-market-square-launch-switch.md` and
its plain-English companion. Plan:
`docs/plans/2026-09-06-market-square-launch-switch-plan.md`.

## What changed

- `lib/market-square.ts`: `MARKET_SQUARE_HIDDEN` is
  `NEXT_PUBLIC_MARKET_SQUARE_LIVE === "false" || MARKET_SQUARE_URL === ""`.
- `.env.example` documents the switch beside the URL.
- Comments in the sidebar and the dashboard no longer say "hidden for now".

## What users see

Where the URL is set: a Market Square link near the top of the sidebar; the
live, posts and people promos between the dashboard briefs; the square's feed
at the foot of the dashboard with its compose button. The square's reads have
no interval; they refresh on mount and focus through the existing proxy. The
dashboard's spot universe refresh (one price request a minute) runs while the
square is shown, because the square resolves `$TICKER` mentions against it.

## Verification

- Red: switch tests failed against the constant. Green: they pass, with the
  `marketSquareHref` cases, in `lib/market-square.test.ts`.
- `./scripts/preflight.sh` in full: Prettier, ESLint, TypeScript, Vitest,
  production build.
- Dev server with the local URL set: the sidebar entry and the dashboard's
  square blocks render; see the PR for the check.

## Scenario impact

`updated`: the dashboard gains the square blocks and the rail gains an entry
in every environment with the URL configured. Any deployed environment that
must keep the square closed needs `NEXT_PUBLIC_MARKET_SQUARE_LIVE=false` set
before this deploys.
