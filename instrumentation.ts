// Next.js file convention: `register` runs once as a server instance starts,
// before it serves a request, and `onRequestError` is handed every error the
// server catches. See
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md.
//
// This is the server half of Watchtower. The browser half lives in
// instrumentation-client.ts, and both read their options from
// lib/analytics/watchtower.ts so the scrubbing rules cannot drift apart.

import * as Sentry from "@sentry/nextjs";
import { watchtowerEnabled, watchtowerOptions } from "@/lib/analytics/watchtower";

export function register(): void {
  if (!watchtowerEnabled) return;

  // Both server runtimes are initialised the same way. The check is still
  // worth keeping: Next runs this file in the Node runtime and again in the
  // Edge runtime, and being explicit about which one is reporting is what
  // stops a future edge-only option from being applied to both by accident.
  const runtime = process.env.NEXT_RUNTIME;
  if (runtime !== "nodejs" && runtime !== "edge") return;

  Sentry.init(watchtowerOptions());
}

// Errors thrown inside route handlers and Server Components. Without this they
// are logged to the platform and nowhere else, which is the gap that made
// upstream failures invisible unless someone was reading Vercel logs.
export const onRequestError = Sentry.captureRequestError;
