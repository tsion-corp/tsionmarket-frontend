# Plan: the phone Market page on ui/2.0

Source: PR #428 head at 6e77fdf0. Target: `ui/2.0`.

1. Copy in unchanged: `app/(session)/market/page.tsx`,
   `features/trade/hooks/use-fit-rows.ts`, `hooks/use-market-handoff.ts`, the
   `ResizeObserver` stub in `vitest.setup.ts`.
2. `mobile-market-view.tsx` + test: drop the Leverage tab, its desktop route,
   the `PerpsSection` import and render block; the test loses the perps stub
   and its two Leverage cases, and the tab-selection case uses Memecoins.
3. `prediction-market-list.tsx` + test: `href` is null for every card (no
   detail route here); the test's link assertions become plain-text
   assertions; `features/prediction/index.ts` exports the list.
4. `/spot`, `/meme`, `/prediction` pages: `useMarketHandoff` as in the PR.
5. Dock: icon 2 pushes `/market`; icons 3 and 5 unchanged.
6. Catalogs (5): add `meme.marketMetrics`, `closeMetrics`, `marketCap`,
   `volume24h`, `liquidity`, `fdv` and `prediction.predictYes`, `predictNo`;
   remove `markets.tabLeverage`.
7. Tests, Red first: a handoff-hook test (phone replaces to
   `/market?tab=<tab>`, desktop does nothing); the dock test for icon 2.
8. `./scripts/preflight.sh`, release note section, one commit.
