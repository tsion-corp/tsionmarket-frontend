# Plan: the "Own the Real World" shelf

1. Feed: `RwaBriefRow` gains `category` and `apyBps`; the server's rwa
   section returns every listed asset. Tests in `lib/server/dashboard-feed.test.ts`.
2. `hooks/use-interest.ts`: the saved interest via `useSyncExternalStore`,
   null on the server. Test.
3. `features/discovery/types.ts`: `RwaSpot` (id, symbol, name, issuer,
   category, price, change, up, apy, logo, href), all display-ready.
4. `app/(session)/(app)/dashboard/discovery/real-assets.ts`: `useRwaSpots()`
   from the feed, grouped and formatted. Tests: grouping, formatting, empty.
5. `features/discovery/components/real-assets-row.tsx` and
   `real-assets-cards.tsx`: the heading (accent on "Real World", `/rwa`), the
   carousel, the four cards, the stocks rotation held on hover. Tests per
   card, idle and live, and the row.
6. Dashboard: the row last on both the phone and desktop discovery areas,
   behind `interestToSection(useInterest()) === "rwa"`.
7. Catalogs (5), preflight, release note, one commit.
