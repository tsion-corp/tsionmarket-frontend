import { NextResponse, type NextRequest } from "next/server";

// The route guard behind the launch gate (see lib/launch-gate.ts). While the
// site is closed, by the clock or by ALLOW_ACCESS=false, every request except
// the landing page redirects back to it, so typing /dashboard (or any other
// path) by hand goes nowhere while the marketing page stays up. The clock is
// read on every request, so the site opens itself at NEXT_PUBLIC_LAUNCH_AT
// without a redeploy. The client-side gate swaps the film for the countdown
// and gates the landing CTAs; this one backstops direct navigation, which no
// client check can.

// The closed site's own endpoints. The landing page is what it serves while
// shut, so the routes that page calls have to survive the guard.
const OPEN_PATHS = new Set(["/", "/api/waitlist"]);

function closedNow(): boolean {
  if (process.env.ALLOW_ACCESS === "false") return true;
  const raw = process.env.NEXT_PUBLIC_LAUNCH_AT;
  if (!raw) return false;
  const launchAt = Date.parse(raw);
  return Number.isFinite(launchAt) && Date.now() < launchAt;
}

export function proxy(request: NextRequest) {
  if (!closedNow()) return NextResponse.next();
  if (OPEN_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  // Static assets and any dotted file (icons, images, fonts) stay reachable —
  // the landing page is built from them.
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
