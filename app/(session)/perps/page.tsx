"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const tSections = useTranslations("sections");

  return (
    <AuthGuard>
      <div className="min-h-screen bg-black text-white">
        {/* The screen's whole header: the way back into the app, and the name
            of where you are, on one row. The title sits here rather than in
            the section below because it reads from the same `sections.perps`
            the rail and every other nav surface reads, and because a heading
            on its own line under the button was ~64px of this screen spent
            saying one word.

            It stays OUTSIDE the inert wrapper with the hamburger. That is
            deliberate and safe: `inert` covers an element and everything under
            it, so a header inside it would take the hamburger out of reach at
            exactly the moment the rail is open and the hamburger is the only
            way to close it. The title is static text, so nothing is lost by
            its living out here. */}
        <div className="mx-auto w-full max-w-[1920px] px-4 pt-5 pb-4 sm:px-6 lg:px-8">
          <PerpsMenuDrawer
            open={menuOpen}
            onOpenChange={setMenuOpen}
            title={
              <h1 className="ws-display min-w-0 truncate text-[22px] leading-none tracking-[-0.01em] text-white sm:text-[26px]">
                {tSections("perps")}
              </h1>
            }
          />
        </div>
        <div inert={menuOpen}>
          {/* The header above names the screen, so the section does not, and
              drops the top padding that framed its eyebrow with it. */}
          <PerpsSection heading={false} />
        </div>
      </div>
    </AuthGuard>
  );
}
