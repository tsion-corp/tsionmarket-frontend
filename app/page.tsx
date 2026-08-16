import { ScrollJourney } from "@/components/landing/scroll-journey";
import { WaitlistPage } from "@/components/landing/waitlist/waitlist-page";
import { LAUNCH_AT_MS, isAppLive } from "@/lib/launch-gate";

// The landing route serves the scroll film while the app is live, and the
// countdown (or, with no launch scheduled, the waitlist) while it is closed.
// The gate is decided per request against the clock, which is why this route
// is dynamic: a static render would freeze whichever side it was built on.
// The film's layers and video never load on a closed site.
export const dynamic = "force-dynamic";

// A server component runs once per request, so reading the clock here is the
// request's time; the compiler's render-purity rule is about client re-renders.
function requestNow(): number {
  return Date.now();
}

export default function LandingPage() {
  const now = requestNow();
  return isAppLive(now) ? (
    <ScrollJourney />
  ) : (
    <WaitlistPage launchAt={LAUNCH_AT_MS} serverNow={now} />
  );
}
