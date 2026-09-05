"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { PerpsSection, PerpsBackLink } from "@/features/trade";

// Perpetuals as its own immersive, full-viewport screen: no sidebar, no
// topbar, just a back link to Portfolio (the account home) and the perps
// desk itself. PerpsSection is the same component /dashboard's own portfolio
// scroll-anchor mounts, so the body is identical either way — only the
// chrome around it differs here.
export default function PerpsPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto w-full max-w-[1920px] px-4 pt-5 sm:px-6 lg:px-8">
          <PerpsBackLink href="/dashboard#portfolio" label="Portfolio" />
        </div>
        <PerpsSection />
      </div>
    </AuthGuard>
  );
}
