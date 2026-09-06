"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useTranslations } from "next-intl";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { MarketLogo } from "@/components/ui/market-logo";
import { toast } from "@/lib/toast";

// Sign the user out after this long with no interaction, so a funded session
// left open on an unattended device doesn't stay open.
const IDLE_TIMEOUT_HOURS = 2;
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_HOURS * 60 * 60 * 1000;

interface AuthGuardProps {
  children: React.ReactNode;
  /**
   * True when the server verified the session cookie for this render. The
   * page then shows at once instead of waiting for Privy's browser SDK to
   * start, which is the moment the server-rendered balance is already in the
   * cache but nothing could show it. Privy remains the authority: if it
   * settles on signed out, the redirect below still fires.
   */
  serverVerified?: boolean;
}

export function AuthGuard({ children, serverVerified = false }: AuthGuardProps) {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const t = useTranslations("auth");

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/auth");
    }
  }, [ready, authenticated, router]);

  // The message derives its figure from the same constant as the timer. The
  // two had drifted: the timer said two hours while the toast said fifteen
  // minutes, in English regardless of locale.
  useIdleLogout(IDLE_TIMEOUT_MS, ready && authenticated, () =>
    toast.info(t("idleSignedOut", { hours: IDLE_TIMEOUT_HOURS }))
  );

  // Not yet known in the browser, and the server did not vouch either: hold
  // the page back. Once Privy has answered, only a signed-in session renders.
  const holdBack = ready ? !authenticated : !serverVerified;
  if (holdBack) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-black">
        {/* The loop is the loading affordance: white paint, glitch, settle. */}
        <MarketLogo className="w-[170px]" />
        <span className="text-sm text-white/50">Loading…</span>
      </div>
    );
  }

  return <>{children}</>;
}
