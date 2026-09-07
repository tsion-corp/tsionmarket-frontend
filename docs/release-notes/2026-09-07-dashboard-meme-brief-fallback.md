---
title: Dashboard memecoin brief fills from the Base catalogue
date: 2026-09-07
area: memecoins
scenario-impact: none
---

# Release Note: the dashboard's memecoin brief no longer says "nothing to show"

## What happened

The trade service's trending list is almost entirely Solana and ignores
`?chain`. With discovery Base-only for now, the boundary emptied it, and the
server-composed dashboard feed only fell back to the Base catalogue when
trending _errored_, never when it came back thin. The page's own shortlist
already fell back on thin, so `/meme` showed Base coins while the dashboard
said "Nothing to show yet".

## What changed

The feed's memecoin section falls back to the Base catalogue whenever
trending yields fewer rows than the brief shows, and keeps the thin trending
rows if the catalogue itself fails. The dashboard and the page now agree.
