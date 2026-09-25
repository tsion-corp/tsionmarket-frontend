"use client";

import type { AuthMethod } from "@/lib/analytics/events";

// Privy told us which method completed a login via its onComplete callback;
// Decane has no equivalent, so the auth components record the method they are
// about to attempt and AnalyticsIdentity consumes it when the session actually
// lands. A session that appears WITHOUT a recorded method is a hydrated
// returning session (page reload), which must not count as a login event.

let pendingMethod: AuthMethod | null = null;

export function recordAuthMethod(method: AuthMethod): void {
  pendingMethod = method;
}

export function consumeAuthMethod(): AuthMethod | null {
  const method = pendingMethod;
  pendingMethod = null;
  return method;
}
