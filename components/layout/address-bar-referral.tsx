"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useReferralCode } from "@/hooks/use-referral-code";
import { addressWithReferral } from "@/lib/referral-code";

// Pages whose address must stay as it is: signing in, onboarding, the export
// of an old account, and the invite route, which IS a referral link.
const LEFT_ALONE = ["/auth", "/interests", "/legacy-export", "/r/"];

function isLeftAlone(pathname: string): boolean {
  return LEFT_ALONE.some((prefix) =>
    prefix.endsWith("/")
      ? pathname.startsWith(prefix)
      : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

// Keeps the signed-in user's referral code on the address, so a link copied
// from the browser credits them however it is shared
// (ADR-2026-10-01-referral-code-in-address-bar). replaceState, never a
// navigation: no reload, no history entry, and Next keeps usePathname and
// useSearchParams in step with it. The write only happens when the address
// differs, so the re-render it causes is a no-op. Renders nothing.
function AddressBarReferralInner() {
  const code = useReferralCode();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!code || isLeftAlone(pathname)) return;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const next = addressWithReferral(current, code);
    if (next) window.history.replaceState(null, "", next);
  }, [code, pathname, search]);

  return null;
}

// useSearchParams needs a Suspense boundary above it, or every static page
// under the providers would bail out of prerendering.
export function AddressBarReferral() {
  return (
    <Suspense fallback={null}>
      <AddressBarReferralInner />
    </Suspense>
  );
}
