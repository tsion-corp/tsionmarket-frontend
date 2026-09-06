import { SessionProviders } from "./providers";

// Every route that needs a signed-in session, or the means to start one:
// sign-in, onboarding, the product routes in (app), the games, the legacy
// prediction reclaim. The group mounts the Privy wallet SDK and the rest of
// the session providers once for all of them, and keeps them out of the
// landing page, the privacy policy and the welcome carousel, which sit
// outside it and need none of that. Adds nothing to the URL.
export default function SessionLayout({ children }: { children: React.ReactNode }) {
  return <SessionProviders>{children}</SessionProviders>;
}
