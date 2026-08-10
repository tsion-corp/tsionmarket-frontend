import { ScrollJourney } from "@/components/landing/scroll-journey";
import { WaitlistPage } from "@/components/landing/waitlist/waitlist-page";
import { APP_ACTIVE } from "@/lib/launch-gate";

// The landing route serves the scroll film while the app is live, and the
// pre-launch waitlist while it is deactivated. One switch decides
// (NEXT_PUBLIC_APP_ACTIVE), so the film's layers and video never load on a
// closed site.
export default function LandingPage() {
  return APP_ACTIVE ? <ScrollJourney /> : <WaitlistPage />;
}
