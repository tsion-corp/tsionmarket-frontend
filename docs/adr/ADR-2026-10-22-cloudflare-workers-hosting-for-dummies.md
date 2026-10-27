# ADR for Dummies: Moving the market website from Vercel to Cloudflare (free plan)

- **Status:** Accepted 2026-10-22 (revised for the free plan)
- **Full version:** [ADR-2026-10-22-cloudflare-workers-hosting](./ADR-2026-10-22-cloudflare-workers-hosting.md)

## The Idea

Vercel costs too much, so we are moving the market website to Cloudflare's
free plan. The address stays www.tsionark.com. Users should notice nothing.

## The Catch

The free plan has two strict limits:

- **100,000 visits to our server a day.** Pictures and code files don't
  count, but page loads and data refreshes do. We used about 120,000 a day on
  Vercel. Past the limit, visitors see an error until midnight UTC.
- **A tiny amount of computing per visit.** Our pages use more than that today.

So first we remove Square, Shine, live video, Mixpanel and Watchtower (a
separate plan), which cuts a lot of both. Then we **test before switching**.

## How We Switch Safely

1. Put the staging copy on Cloudflare at a temporary address.
2. Use it normally for about 3 days and read Cloudflare's numbers.
3. **If it fits:** build the live copy, move tsionark.com's address book (DNS)
   to Cloudflare keeping every email entry, and point the site at Cloudflare.
   Vercel keeps running for a week as a safety net.
4. **If it doesn't fit:** we tune the heaviest parts and test again. If it
   still doesn't fit, you decide between $5 a month or a bigger rebuild.

Nothing changes for real users until step 3.

## What It Costs

Nothing, if the test passes.

## What We Give Up

- Data that used to be cached is fetched fresh each time, so pages may load a
  little slower.
- Images are no longer resized automatically.
- If we grow a lot, we will hit the daily limit and must revisit paying.

## What We Need From You

- Approve this plan and the removal plan.
- Later: run one settings script on your computer and connect the branches
  in Cloudflare (we will give exact steps).
