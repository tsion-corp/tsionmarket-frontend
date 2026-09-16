# Technical Implementation Plan: Route Migration `/dashboard` -> `/portfolio`

## 1. Objective

Migrate the primary application home from `/dashboard` to `/portfolio`, eliminating the `/dashboard#portfolio` hash fragment and ensuring seamless automatic redirection for all legacy `/dashboard` traffic.

---

## 2. Affected Files & Directives

### A. Next.js Routing & Config

1. `app/(session)/(app)/portfolio/page.tsx` [NEW]:
   - Mounts the hydrated dashboard/portfolio view at `/portfolio`.
2. `app/(session)/(app)/dashboard/page.tsx` [MODIFY]:
   - Server-side redirect `redirect("/portfolio", RedirectType.replace)`.
3. `next.config.ts` [MODIFY]:
   - Add permanent redirects from `/dashboard` and `/dashboard/:path*` to `/portfolio` and `/portfolio/:path*`.

### B. Navigation & Section Resolution

4. `lib/sections.ts` [MODIFY]:
   - Set `portfolio: "/portfolio"` in `SECTION_ROUTES`.
   - Update `sectionForPathname(pathname)` to match `/portfolio`.
5. `hooks/use-app-navigate.ts` [MODIFY]:
   - Update anchor / scroll check for `pathname === "/portfolio"`.
6. `components/layout/sidebar.tsx` [MODIFY]:
   - Update market logo `Link` href to `"/portfolio"`.
7. `components/layout/topbar.tsx` [MODIFY]:
   - Update tour replay navigation check to `"/portfolio"`.
8. `app/(session)/auth/page.tsx` [MODIFY]:
   - Update post-auth destination fallback from `"/dashboard"` to `"/portfolio"`.
9. `app/(session)/interests/page.tsx` & `components/interests/continue-bar.tsx` [MODIFY]:
   - Update onboarding completion route from `"/dashboard"` to `"/portfolio"`.
10. `app/error.tsx` [MODIFY]:
    - Update fallback link from `"/dashboard"` to `"/portfolio"`.
11. `lib/analytics/page-name.ts` [MODIFY]:
    - Update `PAGE_BY_PATH_PREFIX` to map `"/portfolio"` to `"portfolio"`.

### C. Tests

12. `lib/sections.test.ts` [MODIFY]:
    - Assert that `sectionForPathname("/portfolio")` returns `"portfolio"`.
13. `scripts/preflight.sh`:
    - Full quality verification (Lint, Types, Tests, Production Build).
