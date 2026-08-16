// The launch gate: is the app open right now?
//
// Two switches, and the time wins over neither.
//
// NEXT_PUBLIC_LAUNCH_AT is the moment the doors open, an ISO timestamp with
// its offset ("2026-08-16T20:00:00+01:00"). Before it the landing page shows a
// countdown and every other route redirects home; from it on the site is
// live, with no redeploy: the client compares against the clock as it ticks
// and the proxy compares on every request. Unset means no scheduled launch.
//
// NEXT_PUBLIC_APP_ACTIVE=false is the hard takedown: closed regardless of the
// time. It is inlined at build like every NEXT_PUBLIC_ value, so flipping it
// means redeploying, which is also what makes it tamper-proof at runtime. Its
// server-side sibling, ALLOW_ACCESS=false, is read in proxy.ts and rejects
// direct navigation to any route but the landing page.

function parseLaunchAt(raw: string | undefined): number | null {
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** When the doors open, in epoch milliseconds, or null with no launch scheduled. */
export const LAUNCH_AT_MS: number | null = parseLaunchAt(process.env.NEXT_PUBLIC_LAUNCH_AT);

/** True when the takedown switch is off. The time is judged separately. */
export const TAKEDOWN = process.env.NEXT_PUBLIC_APP_ACTIVE === "false";

/** Whether the app is open at `now`. Pure, so the same answer everywhere. */
export function isAppLive(
  now: number = Date.now(),
  launchAt: number | null = LAUNCH_AT_MS
): boolean {
  if (TAKEDOWN) return false;
  return launchAt === null || now >= launchAt;
}
