---
date: 2026-11-19
branch: feat/dashboard-maintenance-lock
base: main
scenario-impact: updated
---

# The app is locked behind a maintenance cover; the landing page stays live

Only the landing page is served. Any other page, the dashboard included,
answers with a full-screen cover saying Ark is undergoing maintenance, with a
way back to the landing page and the support address. The address the visitor
typed stays in the bar, and the response is a 503 with `Retry-After` and
`noindex`, so crawlers treat it as temporary.

Still open: `/`, `/privacy`, `/terms` and the `/api` routes (the landing page
calls the waitlist endpoint). A `?ref=` code on a locked link is still stored.

The switch is `DASHBOARD_LOCKED` in `lib/dashboard-lock.ts`. Reopening the app
is setting it to `false` and redeploying. Full maintenance (`ALLOW_ACCESS=false`)
and the pre-launch countdown still take precedence when set.

Scenarios: every route but the landing page, the legal pages and the API now
shows the cover instead of its content.

Tests: `proxy.test.ts` covers the lock (landing open, app routes rewritten with
a 503, legal pages and API open, referral kept, precedence of the other gates);
`lib/dashboard-lock.test.ts` covers the open paths; the modal has its own test.
