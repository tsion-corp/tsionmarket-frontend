---
date: 2026-10-22
feature: Square, Shine, live broadcast, Mixpanel and Watchtower leave market
scope: chore
scenario-impact: updated
---

# Square, Shine, live broadcast, Mixpanel and Watchtower removed

Decided in [ADR-2026-10-22-remove-square-shine-mixpanel-watchtower](../adr/ADR-2026-10-22-remove-square-shine-mixpanel-watchtower.md).
It also prepares the move to the Cloudflare Workers Free plan.

## What users see

- **No Square.**
  - The Square tab, feed, composer, promos and "share to Square" buttons are gone.
  - The mobile tab bar has four tabs: the selected one takes the raised centre, and with nothing selected the four sit evenly.
  - Activity rows no longer leave room for a share button.
- **No Shine.** The Shine menu entry and the automatic posting of trades, bets and wins are gone.
- **No live video.**
  - Going live and the speaker queue are gone from casino games and chess.
  - The chess "current games" list stays.
- **Avatar.** The account avatar is the generated pattern, now seeded from the wallet address, so some users see a new pattern once. The Square profile photo is no longer shown.
- **Legal pages.**
  - The privacy policy names Clarity as the only analytics tool and drops LiveKit.
  - The terms drop the Square section.

## What changed underneath

- Mixpanel is removed, including its `/api/relay` route.
  - Clarity stays, now identified by a small `ClarityIdentity` provider.
  - The balance refresh after a deposit is kept, as `DepositBalanceRefresh`.
- Watchtower (`@sentry/nextjs`) is removed:
  - the `/api/monitoring` tunnel;
  - `/api/heartbeat` and its hourly cron in `vercel.json`;
  - `instrumentation.ts`.
- The root error pages now log the error with `console.error`. A test covers each one.
- These dependencies are removed: `mixpanel-browser`, `@sentry/nextjs`, `@livekit/components-react` and `livekit-client`.
- Every first-load budget is lowered to the measured size plus 20 kB.
- These environment variables are no longer read:
  - `NEXT_PUBLIC_MIXPANEL_TOKEN`, `NEXT_PUBLIC_WATCHTOWER_DSN`
  - `WATCHTOWER_ORG`, `WATCHTOWER_PROJECT`, `WATCHTOWER_AUTH_TOKEN`
  - `CRON_SECRET`, `SQUARE_ZONE_URL`
  - `NEXT_PUBLIC_MARKET_SQUARE_URL`, `NEXT_PUBLIC_MARKET_SQUARE_LIVE`, `NEXT_PUBLIC_SQUARE_FEATURED`
  - `NEXT_PUBLIC_APP_VERSION`

  They can be deleted from Vercel after this ships.

- Chess challenges still send `videoEnabled: true`, because the backend contract requires it. The backend may open video rooms that nothing joins.

## Scenario impact

Updated:

- Dashboard and portfolio: no Square content, and the stake banner fills the slot the Square banner had.
- Mobile tab bar: four tabs, checked at rest and with each tab selected.
- Account menu and avatar.
- Activity rows and the detail sheet: no share button.
- Casino games and chess: no go-live controls.
