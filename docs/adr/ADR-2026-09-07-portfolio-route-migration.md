# ADR-2026-09-07: Route Migration from `/dashboard` to `/portfolio` and URL Normalization

## Status

Proposed — 2026-09-07. Awaiting human maintainer review and approval.

---

## Context

The application's core user interface has historically been mounted at `/dashboard`. In user-facing flows and internal navigation logic, the main landing surface represents the user's asset holdings, balances, and cross-service summaries under the concept of a **Portfolio**.

However, two architectural issues arose:

1. **URL Hash Fragmentation (`/dashboard#portfolio`)**:
   In `lib/sections.ts`, `SECTION_ROUTES` mapped every secondary section (`spot: "/spot"`, `meme: "/meme"`, `casino: "/casino"`, `rwa: "/rwa"`), but omitted `portfolio` (noted as: _"Portfolio is the dashboard itself, so it has no entry here"_). As a result, navigating to the portfolio section via `useAppNavigate()` executed:
   ```typescript
   router.push(query ? `/dashboard?${query}#${id}` : `/dashboard#${id}`);
   ```
   This forced the URL bar to display `/dashboard#portfolio`.
2. **Naming Disconnect**:
   The user requested renaming the primary route from `/dashboard` to `/portfolio`, while guaranteeing that any visitor or external link accessing `/dashboard` (with or without hash/search parameters) is cleanly and permanently redirected to `/portfolio`.

---

## Decision

We will migrate the primary app view from `/dashboard` to `/portfolio` with backward-compatible redirect handling:

```
External / User Request:
/dashboard  ──(308 Permanent Redirect)──► /portfolio
/dashboard/:path*  ─────────────────────► /portfolio/:path*

Internal Navigation:
useAppNavigate("portfolio") ───────────► router.push("/portfolio")
Auth / Onboarding redirects ───────────► /portfolio
Navigation Rail & Shell ───────────────► /portfolio
```

### 1. Next.js Routing Structure

- Create `app/(session)/(app)/portfolio/page.tsx` as the primary server component, prefetching the dashboard snapshot and mounting `DashboardPage`.
- Maintain `app/(session)/(app)/dashboard/page.tsx` with a server-side redirect to `/portfolio` (`redirect("/portfolio", RedirectType.replace)`), ensuring any deep client/server SSR hitting `/dashboard` resolves immediately.
- In `next.config.ts`, add permanent redirects in `redirects()`:
  - `{ source: "/dashboard", destination: "/portfolio", permanent: true }`
  - `{ source: "/dashboard/:path*", destination: "/portfolio/:path*", permanent: true }`

### 2. Navigation & Section Resolution (`lib/sections.ts` & `hooks/use-app-navigate.ts`)

- Update `SECTION_ROUTES`:
  ```typescript
  export const SECTION_ROUTES: Partial<Record<SectionId, string>> = {
    portfolio: "/portfolio",
    spot: "/spot",
    perps: "/perps",
    ...
  };
  ```
- Update `sectionForPathname()`: Map `/portfolio` (and fallback `/dashboard`) to `"portfolio"`.
- Update `useAppNavigate()`: When `pathname === "/portfolio"`, use in-page scroll if no query params; otherwise push `/portfolio` or target routes cleanly without `#portfolio` anchors.

### 3. Application Shell & Chrome Links

- Update `components/layout/sidebar.tsx`: Market logo and top home link navigate to `/portfolio`.
- Update `components/layout/topbar.tsx`: Tour replay routes to `/portfolio`.
- Update `app/(session)/auth/page.tsx`: Returning users redirect to `/portfolio`.
- Update `app/(session)/interests/page.tsx` & `components/interests/continue-bar.tsx`: Onboarding completion routes to `/portfolio`.
- Update `app/error.tsx`: "Go to portfolio" points to `/portfolio`.
- Update `lib/analytics/page-name.ts`: Map `/portfolio` to `"portfolio"`.

### 4. Zero Data Loss & 20k User Safety

- No user state or local storage keys are tied to the string `"/dashboard"`.
- HTTP 308 permanent redirect preserves HTTP method, query strings, and handles legacy bookmarks transparently.

---

## Consequences

### Positive

- Clean, semantic URL (`/portfolio`) aligned with user expectations.
- Eliminates ugly `/dashboard#portfolio` hash fragment.
- 100% backward compatibility via Next.js HTTP 308 redirects.
- Automated tests verify route resolution and redirection behavior.

### Negative / Trade-offs

- Internal components named `dashboard-*` (e.g. `dashboard-feed`, `use-dashboard-tour`) remain functional and can be gradually renamed in subsequent cleanups to minimize churn across large modules.
