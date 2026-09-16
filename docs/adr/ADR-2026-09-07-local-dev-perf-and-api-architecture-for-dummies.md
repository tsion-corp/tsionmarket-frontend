# ADR-2026-09-07: Making Local Development Fast & Organizing Our API Calls (Plain English Guide / ADR for Dummies)

## Status

Proposed — 2026-09-07. Awaiting review and approval.

---

## What Is This Document?

This is the plain-English companion to [`ADR-2026-09-07-local-dev-perf-and-api-architecture.md`](ADR-2026-09-07-local-dev-perf-and-api-architecture.md). It explains what we are changing to speed up the app on your computer, how we are tidying up how the app talks to servers, and why it matters.

---

## The Problems We Noticed

1. **Local development feels slow:**
   - When running the app locally (`pnpm dev`), starting the server and loading pages takes too long. Every time you restart, the compiler forgets what it did and rebuilds everything from scratch.
   - Some large packages (like icons, game logic, and video streaming tools) were being loaded all at once rather than just the small parts the app actually needed.

2. **Messy and inconsistent network requests:**
   - The app has a set of rules: all network calls must go through a single "front door" (`apiFetch` and `createServiceClient`) so they get safety checks, automatic login token refreshing, and error handling.
   - In reality, over 30 places in the app were bypassing this front door and using the raw browser `fetch` tool directly.
   - When a server went down, those direct calls kept hammering the broken server over and over without stopping.

3. **Weak doorways on some server routes:**
   - Some of our server-side route handlers were accepting loose web addresses. For example, by inserting `..` into a web address, someone could potentially trick the server into asking for internal pages that should have been locked away.

---

## What We Plan To Do

1. **Turn on Turbopack Memory (Local Speedup):**
   - We tell Next.js 16 to save its compilation work to disk (`turbopackFileSystemCacheForDev`). The next time you run `pnpm dev`, it starts up much faster because it remembers the work it already finished.
   - We teach Turbopack to ignore third-party libraries we don't use (like Stripe and Farcaster) so it stops wasting time looking for them.
   - We trim the heavy packages so they only load the exact files being displayed.

2. **Route All Web Requests Through Clean, Official Service Clients:**
   - We create official "Service Clients" for each part of the app (Activity, Casino, RWA, Trading, Wallet Funds).
   - We replace all rogue `fetch()` calls with these clean clients.
   - Now, if any server goes down, the built-in "circuit breaker" catches it immediately and protects the app from lagging.

3. **Lock Down the Server Route Handlers:**
   - We clean up all our API routes so they only accept strict, expected paths and block any sneaky tricks like `..`.
   - We verify that any actions that move funds or change data are truly coming from our own website, not a foreign attacker's page.

---

## What This Means For You

- **Much faster startup and page edits** when coding locally.
- **Cleaner, more reliable code** that doesn't break unexpectedly when network hiccup occurs.
- **Safer financial flows** with zero security loopholes in our route handlers.
