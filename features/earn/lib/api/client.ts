"use client";

// Transport for the earn service (listings, companies, submissions). Everything
// goes through our own same-origin proxy at app/api/earn rather than the gateway
// directly, because the gateway sends no CORS headers.
//
// Earn verifies the caller's Privy access token itself and resolves it to its
// own user, roles and company. So authenticated calls attach that token and the
// proxy passes it upstream unchanged; public reads stay a plain cacheable fetch.

import { createServiceClient } from "@/lib/api/service";

const earn = createServiceClient("/api/earn", "Earn is unavailable right now.");

// The browse feed and the availability checks, which a signed-out visitor reads.
export const earnGet = earn.get;
// Anything scoped to the caller: their company, their submissions, the sponsor
// dashboard.
export const earnAuthedGet = earn.authedGet;
export const earnPost = earn.post;
