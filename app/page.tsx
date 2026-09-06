import { MaintenancePage } from "@/components/landing/maintenance-page";
import { ScrollJourney } from "@/components/landing/scroll-journey";
import { WaitlistPage } from "@/components/landing/waitlist/waitlist-page";
import { LAUNCH_AT_MS, TAKEDOWN, isAppLive } from "@/lib/launch-gate";

// The landing route serves the scroll film while the app is live, the
// maintenance page when the takedown switch is on, and the countdown (or,
// with no launch scheduled, the waitlist) while it is merely early.
//
// The two closed states are different stories and must not share a page: the
// countdown tells a visitor the app has not opened yet, which to someone who
// already holds a balance reads as the product being withdrawn.
// The gate is decided per request against the clock, which is why this route
// is dynamic: a static render would freeze whichever side it was built on.
// The film's layers and video never load on a closed site.
export const dynamic = "force-dynamic";

// A server component runs once per request, so reading the clock here is the
// request's time; the compiler's render-purity rule is about client re-renders.
function requestNow(): number {
  return Date.now();
}

// Maintenance is meant to be switched on by setting both flags at once, but
// they are set by hand in a dashboard under time pressure, so honour either.
// Reading ALLOW_ACCESS is safe here and nowhere near lib/launch-gate.ts, which
// a client component imports and where a server-only variable would be
// undefined. proxy.ts checks the same variable itself rather than importing
// this, per the Next guidance that proxy code share no modules.
function underMaintenance(): boolean {
  return TAKEDOWN || process.env.ALLOW_ACCESS === "false";
}

export default function LandingPage() {
  const now = requestNow();
  if (underMaintenance()) return <MaintenancePage />;
  return isAppLive(now) ? (
    <ScrollJourney />
  ) : (
    <WaitlistPage launchAt={LAUNCH_AT_MS} serverNow={now} />
  );
}
