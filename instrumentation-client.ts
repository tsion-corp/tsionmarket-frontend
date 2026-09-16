// Next.js file convention: runs on the client after the HTML loads but
// before React hydrates, which makes it the right place to boot analytics.
// See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md.

import * as Sentry from "@sentry/nextjs";
import { initAnalytics, track } from "@/lib/analytics/mixpanel";
import { initClarity } from "@/lib/analytics/clarity";
import {
  WATCHTOWER_TUNNEL_PATH,
  watchtowerEnabled,
  watchtowerOptions,
} from "@/lib/analytics/watchtower";
import { pageNameForPath } from "@/lib/analytics/page-name";

initAnalytics();
void initClarity();

// Watchtower, for uncaught exceptions and unhandled rejections in the browser.
// First in the file on purpose: this is the reporter, so it should be running
// before anything below it has a chance to throw.
//
// Not wrapped in try/catch, unlike the two above. Sentry.init does not throw on
// a bad DSN or an unreachable endpoint, it degrades to dropping events, and a
// catch here would only hide a genuine misconfiguration at boot.
//
// `tunnel` is browser-only: it sends events to our own origin, which is the
// only way past the ad blocker filters that match Sentry's ingest shape on any
// host. The server has no blocker in front of it and posts to Watchtower
// directly, so instrumentation.ts does not set it.
if (watchtowerEnabled) Sentry.init({ ...watchtowerOptions(), tunnel: WATCHTOWER_TUNNEL_PATH });

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
// Next calls this once per navigation, and two tools want it, so it is one
// exported function that fans out rather than two competing exports. Watchtower
// goes first: it opens the navigation span that any error during the transition
// should be attributed to.
export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse"
): void {
  if (watchtowerEnabled) Sentry.captureRouterTransitionStart(url, navigationType);

  const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
  const page = pageNameForPath(path);
  if (page) track("page_view", { page });
}
