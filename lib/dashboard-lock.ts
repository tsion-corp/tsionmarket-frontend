// The dashboard lock: while it is on, the landing page is the only page the
// app serves. Every other route, the dashboard and the rest of the signed-in
// app included, answers with the maintenance cover (app/maintenance) instead.
//
// Unlike ALLOW_ACCESS=false, which takes the landing page down too, this keeps
// the marketing site live and closes only the app behind it. It is a constant
// rather than an environment variable, like KASH_BUY_ENABLED, so the switch is
// in the code that ships: reopening the app is flipping this to false.
export const DASHBOARD_LOCKED = true;

// What stays reachable while the app is locked. The landing page, the legal
// pages its footer links to, and the API routes, which the landing page calls
// (the waitlist) and which render no page of their own.
const OPEN_PATHS = new Set(["/", "/privacy", "/terms"]);

/** Whether `pathname` is served normally while the dashboard is locked. */
export function isOpenWhileLocked(pathname: string): boolean {
  return OPEN_PATHS.has(pathname) || pathname === "/api" || pathname.startsWith("/api/");
}
