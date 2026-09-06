# ADR-2026-09-06: Turn Market Square on, behind an environment launch switch

## Status

Accepted — 2026-09-06. The maintainer's instruction was that the square is to be
on, not merely switchable, which settled the default: on wherever the square's
URL is configured, with an explicit off.

## Context

Market Square is the platform's social and discovery surface. It is a sibling
deployment, reached by link, and the app already carries every integration
with it: the sidebar entry, three promo blocks interleaved between the
dashboard briefs, the square section at the foot of the dashboard, the compose
button, the broadcast flows from the games, and a server-side proxy
(`app/api/market-square`) that relays an allowlisted set of paths with the
caller's own verified session.

All of the user-facing entries are switched off by one constant,
`MARKET_SQUARE_HIDDEN = true` in `lib/market-square.ts`. Its comment records
why it is a constant and not an environment variable: a deployment that forgot
the variable should keep the square hidden, and showing it again should be a
reviewed change. That reasoning was written to keep the square off. The
maintainer now wants it on.

Two facts shape the decision:

1. The deployment URL is already environment-driven. `NEXT_PUBLIC_MARKET_SQUARE_URL`
   is set locally and every entry already renders nothing without it.
2. The square's reads are cheap. `useSquareFeed` has a 60 s `staleTime` and no
   interval; it refetches on mount and focus. The promos read two lanes and a
   people list; the section reads a lane, the caller's profile and a topic.
   All go through the proxy. Turning the square on does not reintroduce a
   polling load. It does re-enable one poll: the dashboard's spot universe
   (`useSpotMarkets`) runs while the square is shown, because the square
   resolves `$TICKER` mentions against the tradable set; that is one price
   request a minute plus a one-time catalog read.

## Decision

Replace the constant with a switch that is on by default and off only when
said so, exactly as the launch gate's takedown works (`NEXT_PUBLIC_APP_ACTIVE`
in `lib/launch-gate.ts`):

```ts
export const MARKET_SQUARE_HIDDEN: boolean =
  process.env.NEXT_PUBLIC_MARKET_SQUARE_LIVE === "false" || MARKET_SQUARE_URL === "";
```

- On wherever the square's URL is configured. The URL is the real precondition:
  an entry with no destination is a dead link, so a deployment without
  `NEXT_PUBLIC_MARKET_SQUARE_URL` still shows nothing, which keeps the old
  guarantee that a deployment cannot half-reveal the square.
- `NEXT_PUBLIC_MARKET_SQUARE_LIVE=false` is the explicit off: the way to close
  the square in one environment if its deployment misbehaves, without a code
  change. Any other value, including unset, is on.
- Build-inlined like every `NEXT_PUBLIC_` value, so flipping it means a
  redeploy, which also makes it tamper-proof at runtime.

Turning the square on is therefore this change plus a deploy, in every
environment that already has the URL. This change also documents both
variables in `.env.example`.

### Alternatives considered

- **Flip the constant to `false`.** Simplest, but on everywhere at once with
  no per-environment control, and off again only by another code change.
- **Read the switch at request time on the server.** Would allow flipping
  without a redeploy, but the entries are rendered by client components that
  cannot read a server-only variable, and a runtime switch is what the launch
  gate deliberately avoided for tamper resistance.
- **Remove the switch entirely.** Loses the ability to close the square
  quickly if its deployment misbehaves.

## Consequences

- Wherever the URL is set: the sidebar gains the Market Square link (opens the
  square in a new tab), the dashboard shows the live, posts and people promos
  between its briefs, the square section at its foot, and the compose button.
  The dashboard's spot universe poll runs again (one request a minute).
- Without the URL, or with the switch set to `false`: nothing changes.
- `lib/market-square.test.ts` gains cases for the switch: URL set and switch
  unset shows; `"false"` hides; no URL hides regardless. Because the module
  reads the environment at import time, the tests import it fresh per case.
- Deployments that have the URL configured show the square on their next
  deploy of this change. Any environment that should stay closed needs
  `NEXT_PUBLIC_MARKET_SQUARE_LIVE=false` set before that deploy.
- Scenario impact: `updated` where the switch is on (dashboard layout gains
  the square blocks; the rail gains an entry).

## Verification plan

1. Red: tests for the switch fail against the constant.
2. Green: the switch; `.env.example` and `.env.local` updated.
3. `./scripts/preflight.sh` in full.
4. Dev server with the switch on: the sidebar entry and the dashboard blocks
   render; the square feed loads through the proxy; the network panel shows no
   new interval poll from the square itself.
5. Dev server with the switch unset: the dashboard is byte-identical to today
   in those regions.
