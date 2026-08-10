import { NextResponse, type NextRequest } from "next/server";

// The soft-takedown route guard. With ALLOW_ACCESS=false every request except
// the landing page redirects back to it, so typing /dashboard (or any other
// path) by hand goes nowhere while the marketing page stays up. Unset means
// fully open. The client-side sibling, NEXT_PUBLIC_APP_ACTIVE, gates the
// landing CTAs and swaps the film for the waitlist (see lib/launch-gate.ts);
// this one backstops direct navigation, which no client check can.

// The closed site's own endpoints. The landing page is what it serves while
// shut, so the routes that page calls have to survive the guard — redirecting
// the waitlist POST to / would break the only thing left to do here.
const OPEN_PATHS = new Set(["/", "/api/waitlist"]);

export function proxy(request: NextRequest) {
  if (process.env.ALLOW_ACCESS !== "false") return NextResponse.next();
  if (OPEN_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  // Static assets and any dotted file (icons, images, fonts) stay reachable —
  // the landing page is built from them.
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
