import { WelcomeCarousel } from "@/components/welcome/welcome-carousel";

// The welcome flow the mobile design opens with. It sits on its own route so
// the landing film and the waitlist keep the root path.
export default function WelcomePage() {
  return <WelcomeCarousel />;
}
