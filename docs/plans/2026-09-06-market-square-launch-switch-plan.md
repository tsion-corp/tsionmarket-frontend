# Plan: Market Square launch switch

Decision: `docs/adr/ADR-2026-09-06-market-square-launch-switch.md`.
Branch: `feat/market-square-live`, off `origin/main` at `1f55fbc`.

## Scope

One module, its test, two environment files, one release note. No component
changes: every entry already renders from `MARKET_SQUARE_HIDDEN` and
`marketSquareHref()`.

## Steps

1. **Red.** In `lib/market-square.test.ts`, add cases that import the module
   fresh per environment value (`vi.resetModules` + `vi.stubEnv`):
   URL set and switch unset shows; `"false"` hides; no URL hides regardless.
   Run: they fail against the constant.
2. **Green.** `lib/market-square.ts`: `MARKET_SQUARE_HIDDEN` is
   `LIVE === "false" || MARKET_SQUARE_URL === ""`. Rewrite the doc comment to
   say what the switch is, that it is on by default, and build-inlined.
3. **Environment.** `.env.example` documents `NEXT_PUBLIC_MARKET_SQUARE_LIVE`
   beside `NEXT_PUBLIC_MARKET_SQUARE_URL`. `.env.local` already has the URL,
   so the local dev server shows the square. (`.env*` files are not committed
   except `.env.example`.)
4. **Stale comments.** The sidebar and dashboard carry "Hidden for now: see
   MARKET_SQUARE_HIDDEN" comments; reword to "Shown where the launch switch is
   on".
5. **Release note.** `docs/release-notes/2026-09-06-market-square-launch-switch.md`,
   `scenario-impact: updated`.
6. **Verify.** `./scripts/preflight.sh` in full. Dev server with the switch on:
   sidebar entry, promos, section and compose button render; the square feed
   loads through `/api/market-square`; no new interval poll. With the switch
   unset: unchanged.
7. **Deliver.** PR against `development` with the governance template.

## Test strategy

- Unit: the switch's four cases, plus the existing `marketSquareHref` case.
- Interactive: the dev server, both switch states, network panel open.

## Interface contracts

- `MARKET_SQUARE_HIDDEN: boolean`, unchanged name and type; consumers unchanged.
- New environment variable: `NEXT_PUBLIC_MARKET_SQUARE_LIVE`, string, exact
  `"false"` disables; anything else, including unset, is on.

## State changes

None in the app's runtime state. Build-time configuration only.

## Out of scope

Setting the variables in Vercel environments; any change to the square's
deployment or to the proxy allowlist.
