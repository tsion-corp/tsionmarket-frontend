# ADR for Dummies: Taking five things out of the market app

- **Status:** Accepted 2026-10-22
- **Full version:** [ADR-2026-10-22-remove-square-shine-mixpanel-watchtower](./ADR-2026-10-22-remove-square-shine-mixpanel-watchtower.md)

## The Idea

We are moving the website to Cloudflare's free plan, which allows far less
traffic and computing per day than we use on Vercel today. The team has also
decided some features no longer belong in market. So we remove them, which
both follows the product decision and makes the app light enough to try on
the free plan.

## What Goes

- **Square:** the social feed, its tab, the "share to Square" buttons.
- **Shine:** the switch that auto-posted your wins to Square.
- **Live broadcast:** going live with video in games and chess. It ran on
  Square's servers.
- **Mixpanel:** the tool that counted clicks and sign-ups. Every click it
  counted was a trip through our server.
- **Watchtower:** the tool that emailed us about errors and checked every
  hour that the site was up.

## What Stays

- Everything users trade, bet, play, deposit and withdraw with.
- Your profile picture pattern (only the Square photo goes).
- Clarity, which records anonymous sessions in the browser and costs our
  server nothing.
- The public status page at uptime.tsionark.com.

## What We Give Up

- Charts of who did what in the app (Mixpanel).
- Automatic error alerts. Until we pick a free replacement, errors show only
  in the browser console and Cloudflare's own logs.
- Social posting and live video.

## How It Ships

One change, tested on staging first, then on the live site. Nothing changes
for users who never used Square, Shine or live video.

## What We Need From You

Approve this plan.
