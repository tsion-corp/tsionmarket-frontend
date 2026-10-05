"use client";

import { useAuthSession } from "@/hooks/use-auth-session";
import { useServerSession } from "@/components/providers/server-session";

/**
 * Whether to draw the signed-in chrome (the account button) or the Sign in
 * button. "unknown" while the session is still starting and the server did
 * not vouch either, so neither is drawn: a signed-in user must not see Sign in
 * flash on every page load.
 */
export function useSignedIn(): "yes" | "no" | "unknown" {
  const { ready, authenticated } = useAuthSession();
  const server = useServerSession();
  if (ready) return authenticated ? "yes" : "no";
  return server ? "yes" : "unknown";
}
