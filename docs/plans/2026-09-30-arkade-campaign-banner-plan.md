# Plan: Arkade campaign banner and landscape modal (2026-09-30)

ADR: docs/adr/ADR-2026-09-30-arkade-campaign-banner-and-landscape-modal.md

## Boundaries

- `features/casino/components/campaign/`: `campaign-clock.ts` (moved hooks and
  formatters), `arkade-campaign-modal.tsx` (moved panel + shell),
  `arkade-campaign-badge.tsx` (thin trigger), `arkade-campaign-banner.tsx`
  - `.module.css` (new), `arkade-campaign.module.css` (landscape from `md`).
- `features/casino/hooks/use-arkade-campaign.ts`: keyed by wallet.
- `features/casino/components/arkade-desktop.tsx`, `arkade-mobile.tsx`: banner
  above the featured banner.
- `features/portfolio/components/portfolio-view.tsx`: `campaignSlot` prop,
  rendered above the balance row in both layouts.
- `app/(session)/(app)/portfolio/page.tsx`: passes `<ArkadeCampaignBanner />`.
- `messages/{en,de,es,fr,pt}.json`: `casino.campaign.*`.

## Interfaces

- `useArkadeCampaign(enabled: boolean, wallet: string | null)`
- `useCampaignClock(journey?: ArkadeCampaignJourney): number`
- `ArkadeCampaignModal({ open, onClose, journey, seconds })`
- `ArkadeCampaignBadge({ className?, enabled?, wallet? })`
- `ArkadeCampaignBanner({ className? })`: reads the session itself; null when
  there is no session, no campaign, or the campaign is cancelled.
- `PortfolioView({ campaignSlot?: ReactNode, ... })`

## Test strategy (red first)

- `arkade-campaign-banner.test.tsx`: figures from the journey; click opens the
  modal; nothing without session/campaign; qualified state.
- `arkade-campaign-modal.test.tsx`: landscape class on the panel; both columns.
- `arkade-campaign-badge.test.tsx`: gate reworded to wallet; still opens.
- `portfolio-view.test.tsx`: slot renders above the balance row, both layouts.
- `arkade-desktop.test.tsx` / `arkade-mobile.test.tsx`: banner mounted first.

## Steps

1. Clock + modal extraction, badge thinned, hook rekeyed. Tests green.
2. Landscape CSS. Modal test.
3. Banner component + CSS + copy. Banner test.
4. Mount on Arkade and portfolio. View tests.
5. Release note, preflight, ship script.
