---
date: 2026-09-11
feature: The Hyperliquid perps desk is back on staging
scope: trade, perp proxy, dashboard, discovery, navigation
scenario-impact: updated
---

# The Hyperliquid perps desk is back on staging

## What changed

The 2.0 interface port to staging (#431) removed the perpetuals desk, because
its backend was not on production and staging was about to be merged into
`main`. The staging gateway serves the perp service, so the desk returns to
staging. It is the Hyperliquid (Ark) desk from the last staging tree that had
it, with the 2.0 order ticket and chart shell that #422 gave it.

- **Perpetuals is in the navigation again**, after Spot, on the desktop rail,
  the phone drawer, the feature marquee and the dashboard tour, with the trend
  icon. The perps interest from onboarding leads the nav with it, and voice
  navigation can open it.
- **`/perps` and `/trade/:symbol` are back.** `/perps` is the desk inside the
  app shell. `/trade/BTC` is the full-page terminal, opened on that market.
- **The phone market page has a Leverage tab**, second after Spot, rendering
  the desk inline. `/market?tab=perps` opens on it, and at desktop width the
  tab hands off to `/perps` the way the other tabs hand off to theirs.
- **The perps desk has its own shelf on the home page again.** "Own the market
  with leverage trading." stands beside the other services' shelves on desktop,
  under "Join the Conversation", with the Enter The Arena card the design drew
  for it:
  the lavender gradient, the star field, the trend curve with an orb at each
  end, the coin stack, the ray burst, and the Trade Now pill. The heading and
  the card both open the desk. The heading highlights "leverage trading" the
  way the other shelves highlight a phrase. On the phone, the same banner is
  back where the design draws it, after "Find the next 100X", and now opens
  the Leverage tab; its heading and label are translated, where they were
  English literals before.
- **The `/api/perp` proxy is back**, with its allowlist, the session check on
  writes, and the wallet ownership checks on trader bodies and address-scoped
  reads.

## Fixed on the way back

- **The dashboard's perps brief read the Avantis endpoints.** It asked the
  perp service for `pairs` and `prices`, which the Hyperliquid service answers
  with 404, so the brief could only ever be "unavailable". It now reads the
  same `ark/assets` and `ark/market-contexts` the desk reads, validates both
  at the server boundary with zod, lists only the majors the venue lists as
  native, active perps, and takes the leverage from the venue. The brief stays
  hidden with the other three, as it was; removing `perps` from the hidden
  list brings it back.
- **The gateway helper has no per-service override.** The restored
  `wsapiPerpRequest` builds on `WSAPI_BASE_URL` only; the old
  `PERP_API_BASE_URL` variable is not brought back.
- **Refreshes are scoped.** The portfolio's fresh read now takes the networks
  to re-read. A perps top-up or withdrawal re-reads Base and Arbitrum, the two
  chains the money crosses, instead of every network.

## Left out on purpose

Seventeen perps files from the old tree are not restored, because nothing in
that tree reached them any more: the pre-2.0 market panel, order form, simple
view, mode switch and market header, and what only they used (the chart
panel, order book, trade tape, wallet panel and funding chart, the asset
context, order book, trades and funding history hooks, the websocket client
and its types) plus the voice perp prefill hook, which nothing called. The
images only those files drew are left out too.

## One card, both widths

The phone drew the arena as an exported image with its lettering baked in, so
it carried the comp's poster face while the desktop card set the same words in
the app's display face. The phone now renders the same card the desk does: one
component, the app's type, and the copy stepped down for a phone's width (26px
headline over 40px, and the column starts nearer the edge). The export goes with it.

The shelf heading is the same one every other phone row carries, so it wraps
to two lines at a phone's width rather than running into the chevron.

## Also on the band

The Last Man card's wordmark steps down on a phone: 21px over 32px, where it
was 26 over 40. At the phone's card width the design's type ran the name into
the hourglass beside it. The desk keeps the drawn sizes.

## Not on production

Nothing here reaches `main`. Production keeps perpetuals hidden (#382).

## Tests

- `lib/perp/brief.test.ts`: the brief from the live rows, the skipped majors,
  the price fallback, the contract checks.
- `lib/server/dashboard-feed.test.ts`: the perps section from the gateway,
  unavailable when the listing is down or breaks its contract, priced from the
  app's feed when only the marks are down.
- `app/api/perp/[...path]/route.test.ts` (new): the allowlist, traversal,
  sign-in on writes, wallet ownership, forwarding, the unreachable state.
- `features/trade/components/mobile-market-view.test.tsx`: the Leverage tab
  and the `?tab=perps` link.
- `features/discovery/components/own-market-row.test.tsx` (new): the heading
  and the card both lead to the desk, and the card carries its own copy.
- `perps-menu-drawer.test.tsx`, `lib/sections.test.ts`,
  `__tests__/mixpanel.test.ts`.
