# ADR-2026-09-06: Turning Market Square on (Plain English Guide / ADR for Dummies)

## Status

Accepted — 2026-09-06, on the maintainer's instruction that the square is to be on.

---

## What Is This Document?

The plain-English companion to
[`ADR-2026-09-06-market-square-launch-switch.md`](ADR-2026-09-06-market-square-launch-switch.md).
It explains what turning Market Square on means, how the switch works, and
what it costs.

---

## The Situation

Market Square, the social side of the platform, is already fully wired into
the app: a link in the sidebar, three teaser blocks between the dashboard
sections, a social feed at the bottom of the dashboard, a compose button, and
the "go live" flows from the games. All of it is hidden behind one hard-coded
"off" switch in the code, written when the decision was to keep the square out
of sight.

You have asked for it to be on.

---

## What We Propose

Replace the hard-coded "off" with a switch that is **on unless told
otherwise**, the same way the app's emergency takedown switch works:

- Wherever the square's web address (`NEXT_PUBLIC_MARKET_SQUARE_URL`) is
  configured, the square appears on the next deploy. Nothing else to set.
- **Set `NEXT_PUBLIC_MARKET_SQUARE_LIVE=false`** for an environment if you ever
  need to close the square there quickly, and redeploy.
- Without the web address, nothing appears, because a link that goes nowhere
  is worse than no link.

## What You Will See When It Is On

- A "Market Square" link near the top of the sidebar that opens the square.
- Between the dashboard sections: a live-streams teaser, a posts teaser and a
  people teaser.
- At the bottom of the dashboard: the square's feed, with a compose button.

## What It Costs

Very little. The square's own reads refresh when you open or return to the
page, not on a timer, and they go through our server like everything else.
The one thing that comes back is the dashboard's price refresh once a minute,
because the square needs the list of tradable coins to turn a `$TICKER` in a
post into a real buy button.

## What This Change Does Not Do

- It does not change the square's own deployment or the proxy that talks to it.
- It does not set the square's web address anywhere; environments that have it
  will show the square, environments that do not will not.

## What Happens Next

The change is small: the switch, its tests, the environment file
documentation, a release note, and the full preflight, checked on the local
dev server with the square on and off. One thing to check on your side: any
deployed environment that should keep the square closed needs
`NEXT_PUBLIC_MARKET_SQUARE_LIVE=false` set before this deploys.
