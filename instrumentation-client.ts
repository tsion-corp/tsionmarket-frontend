// Next.js file convention: runs on the client after the HTML loads but
// before React hydrates, which makes it the right place to boot analytics.
// See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md.

import { initAnalytics, track } from "@/lib/analytics/mixpanel";
import { initClarity } from "@/lib/analytics/clarity";
import { pageNameForPath } from "@/lib/analytics/page-name";

initAnalytics();
void initClarity();

// The first load never goes through a router transition, so it is reported
// here; every later navigation comes through the hook below.
if (typeof window !== "undefined") {
  const page = pageNameForPath(window.location.pathname);
  if (page) track("page_view", { page });
}

// Mixpanel doesn't see client-side route changes on its own; this is Next's
// hook for exactly that, fired on every push/replace/back-forward navigation.
//
// Only the nav sections are reported. A path that is not one of them (auth,
// interests, a modal route) sends nothing rather than inventing a page name,
// so `page_view` stays the "a section was opened" event the catalog describes.
// Dashboard tab changes are reported by the dashboard itself, which knows
// which section is showing without parsing a URL.
export function onRouterTransitionStart(url: string): void {
  const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
  const page = pageNameForPath(path);
  if (page) track("page_view", { page });
}
