---
date: 2026-09-30
feature: Arkade campaign banner on the portfolio and Arkade pages, and a landscape campaign modal
scope: feat
scenario-impact: needs_automation
---

# Arkade campaign banner, and a landscape campaign modal

## Hidden for now

The banner is built and switched off (2026-09-30), by the team's call:
`ARKADE_CAMPAIGN_BANNER_HIDDEN` in `features/casino/lib/arkade-campaign.ts`
gates all three mounts, and the hubs load it through `next/dynamic`, so a
hidden banner costs no route anything. The in-game badge and the landscape
modal are live. Showing the banner is flipping one flag.

See `docs/adr/ADR-2026-09-30-arkade-campaign-banner-and-landscape-modal.md`.

## The banner

The weekly Arkade campaign was only reachable from a `92x25px` badge inside
each game. It now has a front door: a poster ticket at the top of the Arkade
page (above the featured game, desktop and phone) and on the portfolio page
above the balance row (both layouts). The whole ticket is one button that
opens the campaign modal.

On the campaign's crimson with the app's gold for the prize: a gift medallion
with the `$50` tag, the campaign's name in the display face, one line that
says what to do ("Hit 11.50x on Arkjet and Chicken, win 4 in a row on
Spin."), a milestone track (`J`, `C`, `S`) that fills gold as missions
complete and ends on the reward, a live `Ends in 6d 2h` clock, and a chrome
`See missions` pill in the same brushed fill as the featured banner's `Play
now`. Once the entry is secured the ticket turns amber and the pill reads
`View entry`. A watermark `A`, a slow light sweep and a scatter of gold
sparkles, all CSS; the sweep stops under `prefers-reduced-motion`. It
renders nothing without a session or a campaign, so a page without one is
unchanged. Copy in all five locales.

## The modal

Was a 360px phone sheet at every width. From `md` it is a landscape panel,
`min(920px, 100%)` wide: the prize, clock, progress and entry state on the
left, the three missions and the fair-draw details on the right, with the
type a size up. Same DOM on the phone, where nothing changes.

## Under it

- `ArkadeCampaignModal` is its own component; the badge is a thin trigger.
- `useArkadeCampaign(enabled, wallet)` is keyed by the session wallet rather
  than the arkjet `playerId`, so the badge and both banners share one query
  and one 5 s poll. The "do not fire the private query until identity is
  known" gate is kept, on the wallet.
- The portfolio route passes the banner in through `campaignSlot`, because
  `features/portfolio` may not import `features/casino`. Deferred with
  `next/dynamic` so the dashboard's first load does not carry it.
- Not in scope: the modal's own copy is still hardcoded English, as shipped.

## Scenarios

New: open the modal from the portfolio banner, from the Arkade banner and
from a game badge; confirm the clock ticks without layout shift; confirm the
secured state. Manual for now, hence `needs_automation`.
