"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useAuthSession } from "@/hooks/use-auth-session";
import { openSignIn } from "@/hooks/use-sign-in";
import { toast } from "@/lib/toast";

/** What the visitor was trying to do, which is what the toast says. */
export type SessionAction =
  | "play"
  | "buy"
  | "sell"
  | "bet"
  | "trade"
  | "fund"
  | "withdraw"
  | "send"
  | "claim"
  | "history"
  | "submit"
  | "broadcast";

// Call before any money or play action. Returns false and shows a "Sign in to
// ..." toast when there is no session. A session that is still starting counts
// as none: better a toast than a stake sent with no wallet behind it.
export function useRequireSession(): (action: SessionAction) => boolean {
  const { ready, authenticated } = useAuthSession();
  const t = useTranslations("auth");
  return useCallback(
    (action: SessionAction) => {
      if (ready && authenticated) return true;
      toast.info(t(`gate.${action}`), {
        id: "sign-in-gate",
        action: { label: t("signIn"), onClick: openSignIn },
      });
      return false;
    },
    [ready, authenticated, t]
  );
}

// For the old "no wallet, go to /auth" branches. Signed in but with a locked
// wallet, the modal opens so the user can unlock it.
export function useSignInPrompt(action: SessionAction): () => void {
  const requireSession = useRequireSession();
  return useCallback(() => {
    if (requireSession(action)) openSignIn();
  }, [requireSession, action]);
}
