"use client";

import { useTranslations } from "next-intl";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { toast } from "@/lib/toast";

// Sign the user out after this long with no interaction, so a funded session
// left open on an unattended device doesn't stay open.
const IDLE_TIMEOUT_HOURS = 24;
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_HOURS * 60 * 60 * 1000;

// Pages no longer wait for a session; actions ask for one themselves
// (useRequireSession). All that is left here is the idle sign-out.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = useAuthSession();
  const t = useTranslations("auth");

  // The message derives its figure from the same constant as the timer.
  useIdleLogout(IDLE_TIMEOUT_MS, ready && authenticated, () =>
    toast.info(t("idleSignedOut", { hours: IDLE_TIMEOUT_HOURS }))
  );

  return <>{children}</>;
}
