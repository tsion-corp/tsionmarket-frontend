"use client";

import { useState } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { PerpsSection, PerpsMenuDrawer } from "@/features/trade";

// Perpetuals as its own immersive, full-viewport screen: no sidebar, no
// topbar, just a hamburger and the perps desk itself. PerpsSection is the same
// component /dashboard's own portfolio scroll-anchor mounts, so the body is
// identical either way; only the chrome around it differs here.
//
// The hamburger opens the app's real rail as an overlay rather than replacing
// the screen with the shell, which would bring the topbar and the phone tab
// bar back with it. The route owns the open flag because the desk below it
// goes inert while the overlay is up.
export default function PerpsPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto w-full max-w-[1920px] px-4 pt-5 sm:px-6 lg:px-8">
          <PerpsMenuDrawer open={menuOpen} onOpenChange={setMenuOpen} />
        </div>
        <div inert={menuOpen}>
          <PerpsSection />
        </div>
      </div>
    </AuthGuard>
  );
}
