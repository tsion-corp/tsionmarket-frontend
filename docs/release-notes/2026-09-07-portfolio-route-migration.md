---
date: 2026-09-07
feature: Portfolio Route Migration
scenario-impact: updated
---

# Release Note: Route Migration from `/dashboard` to `/portfolio`

## Summary

Migrated the primary application home from `/dashboard` to `/portfolio`, eliminating the `/dashboard#portfolio` hash fragment and providing clean, semantic URLs while guaranteeing backward-compatible redirection.

## Key Changes

- **Primary Route**: The main portfolio view is mounted at `/portfolio` (`app/(session)/(app)/portfolio/page.tsx`).
- **HTTP 308 Permanent Redirects**: Added Next.js permanent redirects in `next.config.ts` from `/dashboard` and `/dashboard/:path*` to `/portfolio` and `/portfolio/:path*`.
- **Navigation & Links**: Updated `SECTION_ROUTES`, `useAppNavigate`, sidebar logo link, tour replay trigger, auth redirect fallbacks, and onboarding continue bar to navigate directly to `/portfolio`.
- **Analytics**: Updated path prefix mapping in `lib/analytics/page-name.ts` to attribute `/portfolio` page views to the `"portfolio"` catalog section.
- **Automated Tests**: Added unit tests for `useAppNavigate` and updated `lib/sections.test.ts`.

## Verification

- Local Preflight: All quality gates (ESLint, TypeScript, Vitest suites, Next.js build) validated cleanly.
